import { spawn, spawnSync, type ChildProcessByStdio } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { connect, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { Challenge, Ticket } from "@gnoworld/schemas";
import { Presence, Trends } from "@gnoworld/schemas/indexer";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { CATEGORIES } from "./moderation/provider.ts";
import { fakeErgo, message, PASSWORD, welcome } from "./testing/fakeErgo.ts";
import { loadRoles } from "./roles/roles.ts";
import { cliFile, cliKey } from "./testing/cliSigner.ts";
import { wallet, type Wallet } from "./testing/signer.ts";

interface Server {
  child: ChildProcessByStdio<null, Readable, Readable>;
  out: { stdout: string; stderr: string };
}

const SERVER = fileURLToPath(new URL("..", import.meta.url));
const ENTRY = fileURLToPath(new URL("main.ts", import.meta.url));
// The worlds of the roles file the server ships, by name, as its rooms are listed.
const shippedWorlds = () => [...loadRoles(join(SERVER, "roles.json")).worlds.keys()].toSorted();
// As the image starts it (ADR-0002 §7).
const FLAGS = ["--disallow-code-generation-from-strings"];
const started: Server[] = [];

afterEach(() => {
  for (const { child } of started.splice(0)) child.kill("SIGKILL");
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const folders: string[] = [];
const folder = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  folders.push(dir);
  return dir;
};

// The key the door proves itself to jarvis with, in a file of its own (10u-g2).
const DOOR_KEY = `door-key-${"d".repeat(40)}`;
const doorKeyFile = (): string => {
  const path = join(folder("gnoworld-door-"), "door-key");
  writeFileSync(path, `${DOOR_KEY}\n`);
  return path;
};

const settings = (): Record<string, string> => {
  const dir = folder("gnoworld-main-");
  writeFileSync(join(dir, "pepper"), "a-pepper-of-forty-characters-0123456789");
  return { DATABASE: join(dir, "server.db"), LOG_PEPPER_FILE: join(dir, "pepper"), PORT: "0" };
};

const start = (env: Record<string, string>, flags = FLAGS): Server => {
  const child = spawn(process.execPath, [...flags, ENTRY], {
    env: { PATH: process.env["PATH"] ?? "", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const server = { child, out: { stdout: "", stderr: "" } };
  child.stdout.on("data", (chunk: Buffer) => (server.out.stdout += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (server.out.stderr += chunk.toString()));
  started.push(server);
  return server;
};

// What a child prints arrives in its own time: wait for it, a little at a time.
const until = async (seen: () => boolean): Promise<void> => {
  while (!seen()) await new Promise((resolve) => setTimeout(resolve, 10));
};

// What a stream says up to its `since` word, which follows any replay; then it is left.
const untilSince = async (body: ReadableStream<Uint8Array> | null): Promise<string> => {
  const reader = body?.getReader();
  let text = "";
  while (!text.includes("event: since")) {
    const chunk = await reader?.read();
    if (chunk === undefined || chunk.done) break;
    text += new TextDecoder().decode(chunk.value);
  }
  await reader?.cancel();
  return text;
};

const exited = (server: Server): Promise<number | null> =>
  new Promise((resolve) =>
    server.child.once("exit", (code) => {
      resolve(code);
    }),
  );

const listening = (server: Server): Promise<number> =>
  new Promise((resolve, reject) => {
    const read = (): void => {
      const port = /"event":"listening".*"port":(\d+)/.exec(server.out.stdout)?.[1];
      if (port !== undefined) resolve(Number(port));
    };
    server.child.stdout.on("data", read);
    server.child.once("exit", () => {
      reject(new Error(`exited before listening: ${server.out.stderr}`));
    });
  });

// A server whose roles file's team is `lead`, with jarvis at `jarvis` and the admin API on its own listener; its admin
// port, a POST to it from the admin site, and a sign-in on it that gives the session's cookie.
const adminFor = async (lead: Wallet, jarvis: string) => {
  const roles = join(folder("gnoworld-roles-"), "roles.json");
  writeFileSync(roles, JSON.stringify({ team: [lead.address], trusted: [], worlds: [] }));
  const site = "https://admin.gnoworld.test";
  const server = start({ ...settings(), ROLES_FILE: roles, JARVIS_URL: jarvis, ADMIN_PORT: "0", ADMIN_ORIGINS: site });
  await listening(server);
  await until(() => server.out.stdout.includes('"event":"admin_listening"'));
  const admin = Number(/"event":"admin_listening".*"port":(\d+)/.exec(server.out.stdout)?.[1]);
  const post = (path: string, body: unknown, cookie = ""): Promise<Response> =>
    fetch(`http://127.0.0.1:${String(admin)}${path}`, {
      method: "POST",
      headers: { origin: site, "content-type": "application/json", ...(cookie === "" ? {} : { cookie }) },
      body: JSON.stringify(body),
    });
  const signIn = async (who: Wallet): Promise<string> => {
    const made = Challenge.parse(await (await post("/api/login/challenge", { chainId: "onyx-1" })).json());
    const verified = await post("/api/login/verify", {
      nonce: made.nonce,
      address: who.address,
      proof: who.sign("onyx-1", made.text),
    });
    return (verified.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  };
  return { server, admin, post, signIn };
};

// A preload for the server's child: OpenAI's moderations answer nothing flagged, every other address untouched.
const OPENAI_PASSES = `const real = globalThis.fetch;
const categories = ${JSON.stringify(Object.fromEntries(CATEGORIES.map((category) => [category, false])))};
const scores = ${JSON.stringify(Object.fromEntries(CATEGORIES.map((category) => [category, 0])))};
globalThis.fetch = (input, init) =>
  String(input instanceof Request ? input.url : input) === "https://api.openai.com/v1/moderations"
    ? Promise.resolve(Response.json({ results: [{ categories, category_scores: scores }] }))
    : real(input, init);
`;

// Each test boots a Node process, which takes seconds when the machine is busy (three gates at once): 30 s, not
// Vitest's 5, the assertions unchanged.
describe("the server's process", { timeout: 30_000 }, () => {
  it("starts as the image starts it, and answers /health", async () => {
    const port = await listening(start(settings()));
    expect((await fetch(`http://127.0.0.1:${String(port)}/health`)).status).toBe(200);
  });

  it("refuses to start without --disallow-code-generation-from-strings", async () => {
    const server = start(settings(), []);
    expect(await exited(server)).not.toBe(0);
    expect(server.out.stderr).toContain("--disallow-code-generation-from-strings");
  });

  it("stops at boot on a missing setting, naming it", async () => {
    const server = start(Object.fromEntries(Object.entries(settings()).filter(([key]) => key !== "DATABASE")));
    expect(await exited(server)).not.toBe(0);
    expect(server.out.stderr).toMatch(/setting DATABASE: /);
  });

  it("stops at boot on an empty list of chains, naming the setting", async () => {
    const server = start({ ...settings(), CHAINS: "" });
    expect(await exited(server)).not.toBe(0);
    expect(server.out.stderr).toMatch(/setting CHAINS: /);
  });

  it("walks the login over HTTP: a challenge, a signed proof, /me, a logout, then /me again", async () => {
    const origin = "http://gnoworld.test";
    const port = await listening(start({ ...settings(), ORIGINS: origin }));
    const call = (path: string, init: RequestInit = {}): Promise<Response> =>
      fetch(`http://127.0.0.1:${String(port)}/api/login/${path}`, init);
    const posted = (path: string, body: unknown, cookie = ""): Promise<Response> =>
      call(path, {
        method: "POST",
        headers: { origin, "content-type": "application/json", ...(cookie === "" ? {} : { cookie }) },
        body: JSON.stringify(body),
      });
    const who = wallet();
    const made = Challenge.parse(await (await posted("challenge", { chainId: "onyx-1" })).json());
    expect(made.text).toContain("Domain: gnoworld.test\n");
    const verified = await posted("verify", {
      nonce: made.nonce,
      address: who.address,
      proof: who.sign("onyx-1", made.text),
    });
    expect([verified.status, await verified.json()]).toEqual([200, { address: who.address }]);
    const cookie = (verified.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    expect(cookie).toMatch(/^__Host-session=[A-Za-z0-9_-]{43}$/);
    const known = await call("me", { headers: { cookie } });
    expect([known.status, await known.json()]).toEqual([200, { address: who.address }]);
    expect((await posted("logout", {}, cookie)).status).toBe(204);
    expect(await (await call("me", { headers: { cookie } })).json()).toEqual({ address: null });
    const foreign = await call("challenge", {
      method: "POST",
      headers: { origin: "https://evil.test", "content-type": "application/json" },
      body: JSON.stringify({ chainId: "onyx-1" }),
    });
    expect(foreign.status).toBe(403);
    for (const path of ["/admin", "/api/admin", "/api/login/admin"]) {
      expect((await fetch(`http://127.0.0.1:${String(port)}${path}`)).status).toBe(404);
    }
  });

  it("links a command-line key over the real process: the block from the server, a file from the fixture, the list, and an unlink", async () => {
    const origin = "http://gnoworld.test";
    const port = await listening(start({ ...settings(), ORIGINS: origin }));
    const call = (path: string, init: RequestInit = {}): Promise<Response> =>
      fetch(`http://127.0.0.1:${String(port)}/api/${path}`, init);
    const posted = (path: string, body: unknown, cookie = ""): Promise<Response> =>
      call(path, {
        method: "POST",
        headers: { origin, "content-type": "application/json", ...(cookie === "" ? {} : { cookie }) },
        body: JSON.stringify(body),
      });
    const who = wallet();
    const made = Challenge.parse(await (await posted("login/challenge", { chainId: "onyx-1" })).json());
    const verified = await posted("login/verify", {
      nonce: made.nonce,
      address: who.address,
      proof: who.sign("onyx-1", made.text),
    });
    const cookie = (verified.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    const foreign = await call("links/challenge", {
      method: "POST",
      headers: { origin: "https://evil.test", "content-type": "application/json", cookie },
      body: JSON.stringify({ kind: "cli", address: cliKey().address }),
    });
    expect(foreign.status).toBe(403);
    expect((await posted("links/challenge", { kind: "cli", address: cliKey().address })).status).toBe(401);
    const key = cliKey();
    const code = z
      .object({ nonce: z.string(), memo: z.string(), block: z.string(), expiresAt: z.string() })
      .parse(await (await posted("links/challenge", { kind: "cli", address: key.address }, cookie)).json());
    expect(code.block).toContain(key.address);
    expect(code.block).toContain(code.memo);
    expect(code.block).toContain("gnoworld-link");
    const done = await posted(
      "links/verify",
      { nonce: code.nonce, address: key.address, file: cliFile(key, code.memo) },
      cookie,
    );
    expect(done.status).toBe(200);
    const listed = z
      .object({ members: z.array(z.object({ address: z.string(), kind: z.string() })), linked: z.boolean() })
      .parse(await (await call("links", { headers: { cookie } })).json());
    expect(listed.linked).toBe(true);
    expect(listed.members.map(({ address, kind }) => `${kind} ${address}`).toSorted()).toEqual(
      [`adena ${who.address}`, `cli ${key.address}`].toSorted(),
    );
    expect((await posted("links/unlink", { address: key.address }, cookie)).status).toBe(200);
    expect(await (await call("links", { headers: { cookie } })).json()).toMatchObject({ members: [], linked: false });
  });

  it("mints a ticket for Ergo over the real process, for the cookie's account", async () => {
    const origin = "http://gnoworld.test";
    const port = await listening(start({ ...settings(), ORIGINS: origin }));
    const posted = (path: string, body: unknown, cookie = ""): Promise<Response> =>
      fetch(`http://127.0.0.1:${String(port)}/api/login/${path}`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", ...(cookie === "" ? {} : { cookie }) },
        body: JSON.stringify(body),
      });
    const who = wallet();
    const made = Challenge.parse(await (await posted("challenge", { chainId: "onyx-1" })).json());
    const verified = await posted("verify", {
      nonce: made.nonce,
      address: who.address,
      proof: who.sign("onyx-1", made.text),
    });
    const cookie = (verified.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    const minted = await posted("ticket", {}, cookie);
    expect(minted.status).toBe(200);
    expect(Ticket.parse(await minted.json()).ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("stops at boot when it cannot serve Ergo's socket, naming the setting and leaving a file there as it was", async () => {
    const dir = folder("gnoworld-socket-");
    const taken = join(dir, "taken");
    writeFileSync(taken, "not a socket");
    for (const path of [join(dir, "missing", "auth.sock"), taken]) {
      const server = start({ ...settings(), AUTH_SOCKET: path });
      expect(await exited(server)).not.toBe(0);
      expect(server.out.stderr).toContain("AUTH_SOCKET");
    }
    expect(readFileSync(taken, "utf8")).toBe("not a socket");
  });

  it("links to Ergo as its operator, joins the roles file's rooms, and leaves Ergo when it stops", async () => {
    const ergo = await fakeErgo();
    const env = settings();
    const oper = join(folder("gnoworld-oper-"), "oper");
    writeFileSync(oper, `${PASSWORD}\n`);
    const server = start({ ...env, ERGO_PORT: String(ergo.port), ERGO_OPER_PASSWORD_FILE: oper });
    await listening(server);
    const peer = await ergo.peer(0);
    await welcome(peer, { echo: false });
    // Every world of the roles file the server ships, the stations round the Earth among them (8l), by name.
    const rooms = shippedWorlds().map((world) => `#${world}`);
    expect(peer.lines.filter((line) => line.startsWith("JOIN "))).toEqual([`JOIN ${rooms.join(",")}`]);
    const left = once(peer.socket, "close");
    server.child.kill("SIGTERM");
    expect(await exited(server)).toBe(0);
    await left;
  });

  it(
    "never mutes the roles file's team, mutes another hidden three times, and keeps the strikes' index (3k)",
    { timeout: 60_000 },
    async () => {
      const ergo = await fakeErgo();
      const env = settings();
      const oper = join(folder("gnoworld-oper-"), "oper");
      writeFileSync(oper, `${PASSWORD}\n`);
      const team = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
      const other = "g1uauvt7txunf9zeu2qyrzv0pa5uvwjlq90r3qpa";
      const roles = join(folder("gnoworld-roles-"), "roles.json");
      const rules = { bannedWords: ["spam"], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
      writeFileSync(
        roles,
        JSON.stringify({ team: [team], trusted: [], worlds: [{ slug: "bubble", moderators: [], rules }] }),
      );
      const server = start({ ...env, ROLES_FILE: roles, ERGO_PORT: String(ergo.port), ERGO_OPER_PASSWORD_FILE: oper });
      await listening(server);
      const peer = await ergo.peer(0);
      await welcome(peer);
      for (let n = 0; n < 5; n += 1) {
        peer.say(message(`account=${team};msgid=t${String(n)}`, `${team}!u@h`, ["#bubble", "buy spam"]));
        peer.say(message(`account=${other};msgid=o${String(n)}`, `${other}!u@h`, ["#bubble", "buy spam"]));
      }
      // The mute's own line: the room's flags go out first, with the JOINs (3m).
      expect(await peer.next(/^SAMODE #bubble [+-]b /)).toBe(`SAMODE #bubble +b m:${other}`);
      peer.say("PING :settled");
      await peer.next(/^PONG settled$/);
      expect(peer.lines.filter((line) => line.includes(`m:${team}`))).toEqual([]);
      server.child.kill("SIGTERM");
      expect(await exited(server)).toBe(0);
      const db = new DatabaseSync(env["DATABASE"] ?? "");
      const index = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'verdicts_by_account'")
        .all();
      db.close();
      expect(index).toEqual([{ name: "verdicts_by_account" }]);
    },
  );

  it("makes and archives a room over the real process, for the team of its roles file, and no stranger (3l)", async () => {
    const origin = "http://gnoworld.test";
    const [lead, stranger] = [wallet(), wallet()];
    const roles = join(folder("gnoworld-roles-"), "roles.json");
    const rules = { bannedWords: [], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
    writeFileSync(
      roles,
      JSON.stringify({ team: [lead.address], trusted: [], worlds: [{ slug: "bubble", moderators: [], rules }] }),
    );
    const port = await listening(start({ ...settings(), ORIGINS: origin, ROLES_FILE: roles }));
    const posted = (path: string, body: unknown, { cookie = "", method = "POST" } = {}): Promise<Response> =>
      fetch(`http://127.0.0.1:${String(port)}${path}`, {
        method,
        headers: { origin, "content-type": "application/json", ...(cookie === "" ? {} : { cookie }) },
        body: JSON.stringify(body),
      });
    const session = async (who: ReturnType<typeof wallet>): Promise<string> => {
      const made = Challenge.parse(await (await posted("/api/login/challenge", { chainId: "onyx-1" })).json());
      const proof = who.sign("onyx-1", made.text);
      const verified = await posted("/api/login/verify", { nonce: made.nonce, address: who.address, proof });
      return (verified.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    };
    const [leads, strangers] = [await session(lead), await session(stranger)];
    const room = { world: "bubble", name: "garden" };
    expect((await posted("/api/rooms", room)).status).toBe(401);
    expect((await posted("/api/rooms", room, { cookie: strangers })).status).toBe(403);
    const made = await posted("/api/rooms", room, { cookie: leads });
    expect([made.status, await made.json()]).toEqual([201, { room: "#bubble/garden" }]);
    expect((await posted("/api/rooms", room, { cookie: leads })).status).toBe(400);
    expect((await posted("/api/rooms/bubble/garden", undefined, { cookie: strangers, method: "DELETE" })).status).toBe(
      403,
    );
    expect((await posted("/api/rooms/bubble/garden", undefined, { cookie: leads, method: "DELETE" })).status).toBe(204);
    // Kept, not destroyed: the team still finds it listed.
    const activity = `http://127.0.0.1:${String(port)}/api/activity?worlds=bubble`;
    const rooms = await (await fetch(activity, { headers: { cookie: leads } })).text();
    expect(rooms).toContain('"room":"#bubble/garden"');
    expect((await posted("/api/rooms", room)).status).toBe(401);
    const foreign = await fetch(`http://127.0.0.1:${String(port)}/api/rooms`, {
      method: "POST",
      headers: { origin: "https://evil.test", "content-type": "application/json", cookie: leads },
      body: JSON.stringify({ world: "bubble", name: "pond" }),
    });
    expect(foreign.status).toBe(403);
  });

  it("answers a members room's activity to the team, never to a guest or a stranger (3m)", async () => {
    const origin = "http://gnoworld.test";
    const lead = wallet();
    const roles = join(folder("gnoworld-roles-"), "roles.json");
    const rules = { bannedWords: [], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
    const crew = { room: "#bubble/crew", type: "members", readers: "crew" };
    writeFileSync(
      roles,
      JSON.stringify({
        team: [lead.address],
        trusted: [],
        worlds: [{ slug: "bubble", moderators: [], rules, groups: { crew: [] }, rooms: [crew] }],
      }),
    );
    const port = await listening(start({ ...settings(), ORIGINS: origin, ROLES_FILE: roles }));
    const at = (path: string) => `http://127.0.0.1:${String(port)}${path}`;
    const post = (path: string, body: unknown): Promise<Response> =>
      fetch(at(path), {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    // The session's cookie of a wallet's login.
    const session = async (who: ReturnType<typeof wallet>): Promise<string> => {
      const made = Challenge.parse(await (await post("/api/login/challenge", { chainId: "onyx-1" })).json());
      const proof = who.sign("onyx-1", made.text);
      const verified = await post("/api/login/verify", { nonce: made.nonce, address: who.address, proof });
      return (verified.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    };
    const rooms = async (headers: Record<string, string>) =>
      (await fetch(at("/api/activity?worlds=bubble"), { headers })).text();
    expect(await rooms({})).not.toContain("#bubble/crew");
    expect(await rooms({ cookie: await session(wallet()) })).not.toContain("#bubble/crew");
    expect(await rooms({ cookie: await session(lead) })).toContain("#bubble/crew");
  });

  it("serves the guest chat over the real process: a members room never reaches the link, an open room fails closed with no key, GUEST_CHAT=off is 404 (D430)", async () => {
    const origin = "http://gnoworld.test";
    const ergo = await fakeErgo();
    const oper = join(folder("gnoworld-oper-"), "oper");
    writeFileSync(oper, `${PASSWORD}\n`);
    const roles = join(folder("gnoworld-roles-"), "roles.json");
    const rules = { bannedWords: [], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
    const crew = { room: "#bubble/crew", type: "members", readers: "crew" };
    writeFileSync(
      roles,
      JSON.stringify({
        team: [],
        trusted: [],
        worlds: [{ slug: "bubble", moderators: [], rules, groups: { crew: [] }, rooms: [crew] }],
      }),
    );
    const env = {
      ...settings(),
      ORIGINS: origin,
      ROLES_FILE: roles,
      ERGO_PORT: String(ergo.port),
      ERGO_OPER_PASSWORD_FILE: oper,
    };
    const port = await listening(start(env));
    const peer = await ergo.peer(0);
    await welcome(peer);
    const post = (path: string, body: unknown, cookie = ""): Promise<Response> =>
      fetch(`http://127.0.0.1:${String(port)}${path}`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", ...(cookie === "" ? {} : { cookie }) },
        body: JSON.stringify(body),
      });
    const made = await post("/api/guest", {});
    expect(made.status).toBe(200);
    const cookie = (made.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    expect(cookie).toMatch(/^__Host-guest=/);
    const members = await post("/api/guest/say", { room: "#bubble/crew", text: "hi" }, cookie);
    expect([members.status, await members.json()]).toEqual([404, { error: "not_found" }]);
    const open = await post("/api/guest/say", { room: "#bubble", text: "hi" }, cookie);
    expect([open.status, await open.json()]).toEqual([503, { error: "not_ready", cause: "unchecked" }]);
    peer.say("PING :sync");
    await peer.next(/^PONG sync$/);
    expect(peer.lines.filter((line) => line.includes("RELAYMSG"))).toEqual([]);
    const off = await listening(start({ ...settings(), ORIGINS: origin, GUEST_CHAT: "off" }));
    const refused = await fetch(`http://127.0.0.1:${String(off)}/api/guest`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: "{}",
    });
    expect([refused.status, await refused.json()]).toEqual([404, { error: "not_found" }]);
  });

  it("lists a world's rooms by section from the roles file, to a guest only the rooms it may see (4b)", async () => {
    const rules = { bannedWords: [], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
    const roles = join(folder("gnoworld-roles-"), "roles.json");
    const crew = { room: "#bubble/crew", type: "members", readers: "crew" };
    const sections = [
      { name: "Crew", rooms: ["#bubble/crew"] },
      { name: "Lobby", rooms: ["#bubble"] },
    ];
    writeFileSync(
      roles,
      JSON.stringify({
        team: [],
        trusted: [],
        worlds: [{ slug: "bubble", moderators: [], rules, groups: { crew: [] }, rooms: [crew], sections }],
      }),
    );
    const port = await listening(start({ ...settings(), ROLES_FILE: roles }));
    const ask = (query: string) => fetch(`http://127.0.0.1:${String(port)}/api/rooms${query}`);
    const answer = await ask("?world=bubble");
    expect([answer.status, await answer.text(), answer.headers.get("cache-control")]).toEqual([
      200,
      JSON.stringify({ world: "bubble", sections: [{ name: "Lobby", rooms: [{ room: "#bubble", type: "open" }] }] }),
      "public, max-age=5",
    ]);
    expect((await ask("?world=nowhere")).status).toBe(200);
    expect((await ask("?world=Bubble")).status).toBe(400);
    expect((await ask("")).status).toBe(400);
  });

  it("removes the verdicts older than 180 days when it starts, and keeps the others (3n)", async () => {
    const env = settings();
    const first = start(env);
    await listening(first);
    first.child.kill("SIGTERM");
    expect(await exited(first)).toBe(0);
    const day = 24 * 60 * 60_000;
    const db = new DatabaseSync(env["DATABASE"] ?? "");
    const add = db.prepare(
      "INSERT INTO verdicts (msgid, room, account, action, at) VALUES (?, '#bubble', 'h', 'pass', ?)",
    );
    add.run("old", Date.now() - 181 * day);
    add.run("new", Date.now() - day);
    db.close();
    const second = start(env);
    await listening(second);
    second.child.kill("SIGTERM");
    expect(await exited(second)).toBe(0);
    const after = new DatabaseSync(env["DATABASE"] ?? "");
    const kept = after.prepare("SELECT msgid FROM verdicts ORDER BY msgid").all();
    after.close();
    expect(kept).toEqual([{ msgid: "new" }]);
  });

  it("hands Jarvis's kept answers to the retention: a row past its time goes when it starts, a live one stays (D13920)", async () => {
    const env = settings();
    const first = start(env);
    await listening(first);
    first.child.kill("SIGTERM");
    expect(await exited(first)).toBe(0);
    const seed = new DatabaseSync(env["DATABASE"] ?? "");
    const add = seed.prepare(
      "INSERT INTO jarvis_kept (key, answer, at, until, room, bytes) VALUES (?, '{}', ?, ?, NULL, 2)",
    );
    add.run("past", Date.now() - 2000, Date.now() - 1000);
    add.run("live", Date.now(), Date.now() + 60_000);
    seed.close();
    const second = start(env);
    await listening(second);
    second.child.kill("SIGTERM");
    expect(await exited(second)).toBe(0);
    const after = new DatabaseSync(env["DATABASE"] ?? "");
    const rows = after.prepare("SELECT key FROM jarvis_kept ORDER BY key").all();
    after.close();
    expect(rows).toEqual([{ key: "live" }]);
  });

  it("hands the search index to the retention and to the chat: old lines go when it starts, a REDACT heard drops its line (B1)", async () => {
    const ergo = await fakeErgo();
    const env = settings();
    const oper = join(folder("gnoworld-oper-"), "oper");
    writeFileSync(oper, `${PASSWORD}\n`);
    const roles = join(folder("gnoworld-roles-"), "roles.json");
    const rules = { bannedWords: [], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
    writeFileSync(
      roles,
      JSON.stringify({ team: [], trusted: [], worlds: [{ slug: "bubble", moderators: [], rules }] }),
    );
    const first = start({ ...env, ROLES_FILE: roles });
    await listening(first);
    first.child.kill("SIGTERM");
    expect(await exited(first)).toBe(0);
    const day = 24 * 60 * 60_000;
    const seed = new DatabaseSync(env["DATABASE"] ?? "");
    const add = seed.prepare(
      "INSERT INTO lines (room, world, msgid, account, at, link, text) VALUES ('#bubble', 'bubble', ?, 'g1a', ?, 0, ?)",
    );
    add.run("old", Date.now() - 91 * day, "ancient words");
    add.run("new", Date.now() - day, "recent words");
    add.run("taken", Date.now() - day, "regretted words");
    seed.close();
    const second = start({ ...env, ROLES_FILE: roles, ERGO_PORT: String(ergo.port), ERGO_OPER_PASSWORD_FILE: oper });
    await listening(second);
    const peer = await ergo.peer(0);
    await welcome(peer);
    peer.say(":a!u@h REDACT #bubble taken");
    peer.say("PING :settled");
    await peer.next(/^PONG settled$/);
    second.child.kill("SIGTERM");
    expect(await exited(second)).toBe(0);
    const after = new DatabaseSync(env["DATABASE"] ?? "");
    const kept = after.prepare("SELECT msgid FROM lines ORDER BY msgid").all();
    after.close();
    expect(kept).toEqual([{ msgid: "new" }]);
  });

  it("measures Ergo's folder when it starts, alerting at 80% of ERGO_DATA_MB, not below (3n-b)", async () => {
    const data = folder("gnoworld-ergo-");
    writeFileSync(join(data, "history.db"), Buffer.alloc(900 * 1024));
    const full = start({ ...settings(), ERGO_DATA: data, ERGO_DATA_MB: "1" });
    await listening(full);
    expect(full.out.stdout).toContain('"event":"alert","error":"ergo_volume_near_cap"');
    // The measure runs before the server listens: a roomier cap has said nothing by then.
    const roomy = start({ ...settings(), ERGO_DATA: data, ERGO_DATA_MB: "2" });
    await listening(roomy);
    expect(roomy.out.stdout).not.toContain("ergo_volume");
  });

  // The prices timer (5l) against a proxy that records what the server asks it to tunnel to, as the egress proxy would
  // see it: the server reaches out only through HTTPS_PROXY (NODE_USE_ENV_PROXY), as in the stack.
  const tunnels = async (silent = false): Promise<{ proxy: string; seen: string[]; close: () => void }> => {
    const seen: string[] = [];
    const proxy = createHttpServer();
    proxy.on("connect", (request, socket) => {
      seen.push(request.url ?? "");
      // A silent proxy never answers the CONNECT: the read stays open (F2758).
      if (!silent) socket.end("HTTP/1.1 502 Bad Gateway\r\nconnection: close\r\n\r\n");
    });
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    const { port } = proxy.address() as AddressInfo;
    return {
      proxy: `http://127.0.0.1:${String(port)}`,
      seen,
      close: () => {
        proxy.close();
        proxy.closeAllConnections();
      },
    };
  };

  it("starts the prices timer when MARKETS_FILE is set: it asks CoinGecko at boot, and stops with the server on SIGTERM (5l)", async () => {
    const way = await tunnels();
    try {
      const file = join(folder("gnoworld-markets-"), "markets.json");
      const server = start({
        ...settings(),
        MARKETS_FILE: file,
        HTTPS_PROXY: way.proxy,
        NODE_USE_ENV_PROXY: "1",
      });
      await listening(server);
      await until(() => way.seen.length > 0);
      expect(way.seen).toEqual(["api.coingecko.com:443"]);
      // The failed first read left a timer of five minutes: the server leaves by itself only if SIGTERM stopped it.
      server.child.kill("SIGTERM");
      expect(await exited(server)).toBe(0);
      expect(way.seen).toEqual(["api.coingecko.com:443"]);
      expect(server.out.stdout).toContain('"event":"prices_failed"');
    } finally {
      way.close();
    }
  });

  // The home's block height (2026-10-31): the timer also tunnels to the default universe's RPC, named by UNIVERSES_FILE, and to
  // no other universe's.
  it("reads the default universe's RPC beside CoinGecko when UNIVERSES_FILE names the data, and no other universe's", async () => {
    const way = await tunnels();
    try {
      const dir = folder("gnoworld-universes-");
      const base = {
        name: "U",
        gnoweb: "https://gnoweb.example",
        indexer: "https://indexer.example/graphql/query",
        testnet: true,
      };
      const universes = join(dir, "universes.json");
      writeFileSync(
        universes,
        JSON.stringify([
          { ...base, id: "a", chainId: "a-1", rpc: "https://rpc.not-default.example:443" },
          { ...base, id: "b", chainId: "b-1", rpc: "https://rpc.the-default.example:443", default: true },
        ]),
      );
      const server = start({
        ...settings(),
        MARKETS_FILE: join(dir, "markets.json"),
        UNIVERSES_FILE: universes,
        HTTPS_PROXY: way.proxy,
        NODE_USE_ENV_PROXY: "1",
      });
      await listening(server);
      await until(() => way.seen.length > 1);
      expect([...way.seen].sort()).toEqual(["api.coingecko.com:443", "rpc.the-default.example:443"]);
      server.child.kill("SIGTERM");
      expect(await exited(server)).toBe(0);
      expect(server.out.stdout).toContain('"event":"prices_failed"');
      expect(way.seen.some((host) => host.includes("not-default"))).toBe(false);
    } finally {
      way.close();
    }
  });

  // The worlds job (7c) tunnels to the default universe's RPC alone: the other universe's is not on the way out.
  it("starts the worlds job when WORLDS_FILE and UNIVERSES_FILE are set: it asks the default universe's RPC, and stops on SIGTERM", async () => {
    const way = await tunnels();
    try {
      const dir = folder("gnoworld-worlds-");
      const base = { name: "U", gnoweb: "https://gnoweb.example", testnet: true };
      const universes = join(dir, "universes.json");
      writeFileSync(
        universes,
        JSON.stringify([
          {
            ...base,
            id: "a",
            chainId: "a-1",
            rpc: "https://rpc.not-default.example:443",
            indexer: "https://indexer.not-default.example/graphql",
          },
          {
            ...base,
            id: "b",
            chainId: "b-1",
            rpc: "https://rpc.the-default.example:443",
            indexer: "https://indexer.the-default.example/graphql",
            default: true,
          },
        ]),
      );
      writeFileSync(join(dir, "hubs.json"), "[]");
      const server = start({
        ...settings(),
        WORLDS_FILE: join(dir, "worlds.json"),
        UNIVERSES_FILE: universes,
        HTTPS_PROXY: way.proxy,
        NODE_USE_ENV_PROXY: "1",
      });
      await listening(server);
      await until(() => server.out.stdout.includes('"event":"worlds_failed"'));
      expect(way.seen).toEqual(["rpc.the-default.example:443"]);
      server.child.kill("SIGTERM");
      expect(await exited(server)).toBe(0);
      // 7t3: the chain's habits are kept beside the database, never beside the file nginx serves.
      expect(readdirSync(dir).filter((name) => name.startsWith("trends-"))).toEqual([]);
    } finally {
      way.close();
    }
  });

  // The preview job (8f) reads the default universe's hubs' pages through its RPC alone, and only with the check that reads each capture.
  it("starts the preview job with PREVIEWS_FILE, UNIVERSES_FILE and OpenAI's key: it asks the default universe's RPC alone, and stops on SIGTERM", async () => {
    const way = await tunnels();
    try {
      const dir = folder("gnoworld-previews-");
      const base = { name: "U", testnet: true };
      const universes = join(dir, "universes.json");
      writeFileSync(
        universes,
        JSON.stringify([
          {
            ...base,
            id: "a",
            chainId: "a-1",
            rpc: "https://rpc.not-default.example:443",
            gnoweb: "https://gnoweb.not-default.example",
            indexer: "https://indexer.not-default.example/graphql",
          },
          {
            ...base,
            id: "b",
            chainId: "b-1",
            rpc: "https://rpc.the-default.example:443",
            gnoweb: "https://gnoweb.the-default.example",
            indexer: "https://indexer.the-default.example/graphql",
            default: true,
          },
        ]),
      );
      const hub = {
        name: "GovDAO",
        description: "GovDAO, the governance of gno.land: its proposals and its votes, on chain.",
      };
      writeFileSync(
        join(dir, "hubs.json"),
        JSON.stringify([
          { ...hub, slug: "govdao", universe: "b", realms: ["gno.land/r/gov/dao"] },
          { ...hub, slug: "other", universe: "a", realms: ["gno.land/r/else/where"] },
        ]),
      );
      writeFileSync(join(dir, "key"), "sk-a-key-of-at-least-thirty-two-characters");
      const server = start({
        ...settings(),
        PREVIEWS_FILE: join(dir, "previews.json"),
        UNIVERSES_FILE: universes,
        OPENAI_API_KEY_FILE: join(dir, "key"),
        HTTPS_PROXY: way.proxy,
        NODE_USE_ENV_PROXY: "1",
      });
      await listening(server);
      await until(() => server.out.stdout.includes('"event":"previews_written"'));
      expect(way.seen).toEqual(["rpc.the-default.example:443"]);
      expect(server.out.stdout).not.toContain("gov/dao");
      server.child.kill("SIGTERM");
      expect(await exited(server)).toBe(0);
    } finally {
      way.close();
    }
  });

  it.each([
    ["no UNIVERSES_FILE", {}, "setting UNIVERSES_FILE: required"],
    [
      "no OPENAI_API_KEY_FILE: no check, so no job",
      { UNIVERSES_FILE: "/nowhere/universes.json" },
      "setting OPENAI_API_KEY_FILE: required",
    ],
  ])("does not start with a PREVIEWS_FILE and %s: it fails closed, naming the setting", async (_, over, said) => {
    const server = start({
      ...settings(),
      PREVIEWS_FILE: join(folder("gnoworld-previews-"), "previews.json"),
      ...over,
    });
    expect(await exited(server)).not.toBe(0);
    expect(server.out.stderr).toContain(said);
  });

  it("does not start with a WORLDS_FILE and no UNIVERSES_FILE: it fails closed, naming the setting", async () => {
    const server = start({ ...settings(), WORLDS_FILE: join(folder("gnoworld-worlds-"), "worlds.json") });
    expect(await exited(server)).not.toBe(0);
    expect(server.out.stderr).toContain("setting UNIVERSES_FILE: required");
  });

  it("counts who is here beside its database: /api/presence answers each world, and its history is written as it stops (7h)", async () => {
    const env = settings();
    const server = start(env);
    const port = await listening(server);
    const answer = await fetch(`http://127.0.0.1:${String(port)}/api/presence`);
    expect(answer.status).toBe(200);
    expect(Presence.parse(await answer.json()).worlds.map(({ world }) => world)).toEqual(shippedWorlds());
    server.child.kill("SIGTERM");
    expect(await exited(server)).toBe(0);
    expect(JSON.parse(readFileSync(join(dirname(env["DATABASE"] ?? ""), "presence.json"), "utf8"))).toEqual({});
    expect(
      JSON.parse(readFileSync(join(dirname(env["DATABASE"] ?? ""), "presence-messages.json"), "utf8")),
      "7t3",
    ).toEqual({});
  });

  it("answers the ticker's trends at /api/trends, none with no worlds job and no one here, never a 404 (7t)", async () => {
    for (const env of [settings(), { ...settings(), DATABASE: ":memory:" }]) {
      const port = await listening(start(env));
      const answer = await fetch(`http://127.0.0.1:${String(port)}/api/trends`);
      expect(answer.status).toBe(200);
      expect(answer.headers.get("cache-control")).toBe("public, max-age=60");
      expect(Trends.parse(await answer.json())).toEqual({ items: [] });
    }
  });

  // 7t3: a hub whose rooms surge against its own 14 days is Trending by its chat, and the Rising item names no world already Trending.
  it("names at /api/trends the hub whose people here surge against its own 14 days as Trending, and not again as rising (7t, 7t3)", async () => {
    const ergo = await fakeErgo();
    const env = settings();
    const oper = join(folder("gnoworld-oper-"), "oper");
    writeFileSync(oper, `${PASSWORD}\n`);
    // Bubble's last 47 hours held one person each: six now is a rise of 5 on its usual hour (core's riseOf).
    const hour = Math.floor(Date.now() / 3_600_000) * 3_600_000;
    const past = Array.from({ length: 47 }, (_, back) => ({ at: hour - (back + 1) * 3_600_000, people: 1 })).reverse();
    writeFileSync(join(dirname(env["DATABASE"] ?? ""), "presence.json"), JSON.stringify({ bubble: past }));
    const port = await listening(start({ ...env, ERGO_PORT: String(ergo.port), ERGO_OPER_PASSWORD_FILE: oper }));
    const peer = await ergo.peer(0);
    await welcome(peer);
    await peer.next(/^NAMES #bubble$/);
    peer.say(":ergo.test 324 gnoworld #bubble +nt");
    peer.say(":ergo.test 347 gnoworld #bubble :End");
    peer.say(":ergo.test 353 gnoworld = #bubble :~@gnoworld ada bo cy dee eve fay");
    peer.say(":ergo.test 366 gnoworld #bubble :End");
    await expect
      .poll(async () => Trends.parse(await (await fetch(`http://127.0.0.1:${String(port)}/api/trends`)).json()).items, {
        timeout: 10_000,
      })
      .toEqual([
        { kind: "trending", by: "here", world: "bubble", count: 6, rise: 5, at: expect.any(String) as unknown },
      ]);
  });

  // 7t3: the chain's habits beside the database, counts alone; a database held in memory keeps none.
  it("keeps each world's chain windows beside its database, and none for a database held in memory", async () => {
    const habits = (env: Record<string, string>) => {
      const dir = folder("gnoworld-worlds-");
      writeFileSync(
        join(dir, "universes.json"),
        readFileSync(new URL("../../app/data/universes.json", import.meta.url), "utf8"),
      );
      writeFileSync(join(dir, "hubs.json"), "[]");
      return { ...env, WORLDS_FILE: join(dir, "worlds.json"), UNIVERSES_FILE: join(dir, "universes.json") };
    };
    const env = settings();
    const kept = start(habits(env));
    await listening(kept);
    kept.child.kill("SIGTERM");
    expect(await exited(kept)).toBe(0);
    expect(
      readdirSync(dirname(env["DATABASE"] ?? ""))
        .filter((name) => name.startsWith("trends-"))
        .sort(),
    ).toEqual(["trends-addresses.json", "trends-transactions.json"]);
    const memory = habits({ ...settings(), DATABASE: ":memory:" });
    const none = start(memory);
    await listening(none);
    none.child.kill("SIGTERM");
    expect(await exited(none)).toBe(0);
    expect(readdirSync(dirname(memory.WORLDS_FILE)).filter((name) => name.startsWith("trends-"))).toEqual([]);
  });

  it("keeps no history beside a database held in memory: no /api/presence (7h)", async () => {
    const port = await listening(start({ ...settings(), DATABASE: ":memory:" }));
    expect((await fetch(`http://127.0.0.1:${String(port)}/api/presence`)).status).toBe(404);
  });

  it("starts no worlds job without WORLDS_FILE: nothing is asked of a chain", async () => {
    const way = await tunnels();
    try {
      const server = start({ ...settings(), HTTPS_PROXY: way.proxy, NODE_USE_ENV_PROXY: "1" });
      await listening(server);
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(way.seen).toEqual([]);
      expect(server.out.stdout).not.toContain("worlds");
    } finally {
      way.close();
    }
  });

  // 7t3: the trends read a hub's rooms and its realms as one world, from the hubs beside the universes the job reads.
  it("does not start a worlds job with no hubs.json beside UNIVERSES_FILE: it fails closed, naming the file", async () => {
    const dir = folder("gnoworld-worlds-");
    const universes = join(dir, "universes.json");
    writeFileSync(universes, readFileSync(new URL("../../app/data/universes.json", import.meta.url), "utf8"));
    const server = start({ ...settings(), WORLDS_FILE: join(dir, "worlds.json"), UNIVERSES_FILE: universes });
    expect(await exited(server)).not.toBe(0);
    expect(server.out.stderr).toContain(join(dir, "hubs.json"));
  });

  it("does not start with a UNIVERSES_FILE that holds no default universe: it fails closed, naming the file", async () => {
    const dir = folder("gnoworld-universes-");
    const universes = join(dir, "universes.json");
    writeFileSync(universes, "[]");
    const server = start({ ...settings(), MARKETS_FILE: join(dir, "markets.json"), UNIVERSES_FILE: universes });
    expect(await exited(server)).not.toBe(0);
    expect(server.out.stderr).toContain(universes);
  });

  // The chain's two data files: one good universe, and the hubs file's text as given.
  const chainFiles = (hubsText: string) => {
    const dir = folder("gnoworld-chain-");
    const universes = join(dir, "universes.json");
    const hubs = join(dir, "hubs.json");
    writeFileSync(
      universes,
      JSON.stringify([
        {
          id: "b",
          name: "U",
          chainId: "b-1",
          rpc: "https://rpc.example:443",
          gnoweb: "https://gnoweb.example",
          indexer: "https://indexer.the-chain.example/graphql/query",
          testnet: true,
          default: true,
        },
      ]),
    );
    writeFileSync(hubs, hubsText);
    return { universes, hubs };
  };

  // Slice 9g: the chain's rooms. The data's two files start one poll of each universe's indexer, which the egress way
  // sees as a tunnel; SIGTERM stops it with the rest.
  it("follows each universe's indexer when UNIVERSES_FILE and HUBS_FILE name the data, and stops on SIGTERM", async () => {
    const way = await tunnels();
    try {
      const { universes, hubs } = chainFiles("[]");
      const server = start({
        ...settings(),
        UNIVERSES_FILE: universes,
        HUBS_FILE: hubs,
        HTTPS_PROXY: way.proxy,
        NODE_USE_ENV_PROXY: "1",
      });
      await listening(server);
      await until(() => way.seen.includes("indexer.the-chain.example:443"));
      server.child.kill("SIGTERM");
      expect(await exited(server)).toBe(0);
    } finally {
      way.close();
    }
  });

  it("does not start with a HUBS_FILE that is no good list: it fails closed, naming the file", async () => {
    // The universes are good, so it is the hubs that are judged.
    const { universes, hubs } = chainFiles('{"not":"a list"}');
    const server = start({ ...settings(), UNIVERSES_FILE: universes, HUBS_FILE: hubs });
    expect(await exited(server)).not.toBe(0);
    expect(server.out.stderr).toMatch(/hubs: .*hubs\.json does not hold a good list/);
    expect(server.out.stderr).not.toMatch(/universes: /);
  });

  it("exits on SIGTERM within a bound even with a price read still open on a proxy that never answers (F2758)", async () => {
    const way = await tunnels(true);
    try {
      const file = join(folder("gnoworld-markets-"), "markets.json");
      const server = start({ ...settings(), MARKETS_FILE: file, HTTPS_PROXY: way.proxy, NODE_USE_ENV_PROXY: "1" });
      await listening(server);
      await until(() => way.seen.length > 0);
      const begun = Date.now();
      server.child.kill("SIGTERM");
      expect(await exited(server)).toBe(0);
      // Without the bound the open request holds the process for the connect timeout (10 s) or longer.
      expect(Date.now() - begun).toBeLessThan(3000);
    } finally {
      way.close();
    }
  }, 20_000);

  it("starts no prices timer without MARKETS_FILE: nothing is asked of CoinGecko", async () => {
    const way = await tunnels();
    try {
      const server = start({ ...settings(), HTTPS_PROXY: way.proxy, NODE_USE_ENV_PROXY: "1" });
      await listening(server);
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(way.seen).toEqual([]);
      expect(server.out.stdout).not.toContain("prices");
    } finally {
      way.close();
    }
  });

  it("answers the rooms of the roles file's worlds, made at boot, with no Ergo set", async () => {
    const port = await listening(start(settings()));
    const answer = await fetch(`http://127.0.0.1:${String(port)}/api/activity?worlds=earth,bubble`);
    expect([answer.status, await answer.text()]).toEqual([
      200,
      JSON.stringify({
        rooms: [
          { world: "earth", room: "#earth", perMinute: 0 },
          { world: "bubble", room: "#bubble", perMinute: 0 },
        ],
      }),
    ]);
  });

  // 4d: the pins' table is among its migrations and its routes are mounted, with no Ergo set to read a line from.
  it("serves a room's pins to a guest, none yet, saying it may not pin, and refuses a room that is no room's (4d)", async () => {
    const port = await listening(start(settings()));
    const ask = (query: string) => fetch(`http://127.0.0.1:${String(port)}/api/pins${query}`);
    const answer = await ask("?room=%23bubble");
    expect([answer.status, await answer.text(), answer.headers.get("cache-control")]).toEqual([
      200,
      JSON.stringify({ room: "#bubble", may: false, pins: [] }),
      "no-store",
    ]);
    expect((await ask("?room=bubble")).status).toBe(400);
  });

  it("takes the login's chains and its new accounts an hour from its settings", async () => {
    const origin = "http://gnoworld.test";
    const env = { ...settings(), ORIGINS: origin, CHAINS: "test-5", NEW_ACCOUNTS_PER_HOUR: "1" };
    const port = await listening(start(env));
    const posted = (path: string, body: unknown): Promise<Response> =>
      fetch(`http://127.0.0.1:${String(port)}/api/login/${path}`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    expect((await posted("challenge", { chainId: "onyx-1" })).status).toBe(400);
    const logIn = async (): Promise<number> => {
      const who = wallet();
      const made = Challenge.parse(await (await posted("challenge", { chainId: "test-5" })).json());
      const proof = who.sign("test-5", made.text);
      return (await posted("verify", { nonce: made.nonce, address: who.address, proof })).status;
    };
    expect([await logIn(), await logIn()]).toEqual([200, 429]);
  });

  it("limits login calls per visitor as the trusted proxy names them, over the real connection", async () => {
    const origin = "http://gnoworld.test";
    const port = await listening(start({ ...settings(), ORIGINS: origin, TRUSTED_PROXY: "127.0.0.1" }));
    const ask = (visitor: string): Promise<Response> =>
      fetch(`http://127.0.0.1:${String(port)}/api/login/challenge`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", "x-real-ip": visitor },
        body: JSON.stringify({ chainId: "onyx-1" }),
      });
    for (let i = 0; i < 10; i++) expect((await ask("192.0.2.1")).status).toBe(200);
    expect((await ask("192.0.2.1")).status).toBe(429);
    expect((await ask("192.0.2.2")).status).toBe(200);
  });

  it("stops at boot on a roles file it cannot read, naming the file and never its content", async () => {
    const roles = join(folder("gnoworld-roles-"), "roles.json");
    writeFileSync(roles, JSON.stringify({ team: ["planted-value"], trusted: [], worlds: [] }));
    const server = start({ ...settings(), ROLES_FILE: roles });
    expect(await exited(server)).not.toBe(0);
    expect(server.out.stderr).toContain(`roles file ${roles}: team.0: custom`);
    expect(server.out.stderr).not.toContain("planted-value");
  });

  it("refuses a second process on the same database, and the first keeps serving", async () => {
    const env = settings();
    const port = await listening(start(env));
    const second = start(env);
    expect(await exited(second)).not.toBe(0);
    expect(second.out.stderr).toMatch(/database is locked/);
    expect((await fetch(`http://127.0.0.1:${String(port)}/health`)).status).toBe(200);
  });

  it("serves the verdicts' stream, counting visitors by the trusted proxy, and ends it on SIGTERM (3j)", async () => {
    const server = start({ ...settings(), TRUSTED_PROXY: "127.0.0.1" });
    const port = await listening(server);
    const follow = (visitor: string) =>
      fetch(`http://127.0.0.1:${String(port)}/api/stream?rooms=%23bubble`, { headers: { "x-real-ip": visitor } });
    const open = [];
    for (let i = 0; i < 4; i++) open.push(await follow("192.0.2.1"));
    expect(open.map(({ status, headers }) => [status, headers.get("content-type")])).toEqual(
      Array.from({ length: 4 }, () => [200, "text/event-stream"]),
    );
    expect((await follow("192.0.2.1")).status).toBe(429);
    const other = await follow("192.0.2.2");
    expect(other.status).toBe(200);
    server.child.kill("SIGTERM");
    expect(await exited(server)).toBe(0);
    // Read to its end: what it says before it ends is not this test's.
    const reader = other.body?.getReader();
    let chunk = await reader?.read();
    while (chunk?.done === false) chunk = await reader?.read();
    expect(chunk?.done).toBe(true);
  });

  it("drains on SIGTERM: a request already begun is answered, then the process exits 0", async () => {
    const server = start(settings());
    const port = await listening(server);
    const socket = connect(port, "127.0.0.1");
    let answer = "";
    socket.on("data", (chunk: Buffer) => (answer += chunk.toString()));
    const closed = once(socket, "close");
    await once(socket, "connect");
    // One write: once the first answer is back, the server has read the second request's start too.
    socket.write("GET /health HTTP/1.1\r\nHost: localhost\r\n\r\nGET /ready HTTP/1.1\r\nHost: localhost\r\n");
    await until(() => answer.includes("\r\n\r\nok"));
    const exit = exited(server);
    server.child.kill("SIGTERM");
    await until(() => server.out.stdout.includes('"event":"stopping"'));
    socket.end("\r\n");
    await closed;
    expect(answer).toMatch(/^HTTP\/1\.1 200 [\s\S]*HTTP\/1\.1 503 /);
    expect(await exit).toBe(0);
  });

  it("drains on SIGINT as on SIGTERM, and exits 0", async () => {
    const server = start(settings());
    await listening(server);
    const exit = exited(server);
    server.child.kill("SIGINT");
    await until(() => server.out.stdout.includes('"event":"stopping"'));
    expect(await exit).toBe(0);
  });

  it("exits 0 at once on SIGTERM when its only client is an idle kept-alive connection", async () => {
    const server = start(settings());
    const port = await listening(server);
    const socket = connect(port, "127.0.0.1");
    let answer = "";
    socket.on("data", (chunk: Buffer) => (answer += chunk.toString()));
    await once(socket, "connect");
    socket.write("GET /health HTTP/1.1\r\nHost: localhost\r\n\r\n");
    await until(() => answer.includes("\r\n\r\nok"));
    const started = performance.now();
    server.child.kill("SIGTERM");
    expect(await exited(server)).toBe(0);
    // The keep-alive timeout is 5 seconds: closing at once means the idle connection was not waited for.
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it("serves the admin API and its login on their own listener alone, never on the public one (ADR-0002 §6)", async () => {
    const server = start({
      ...settings(),
      ORIGINS: "https://gnoworld.test",
      JARVIS_URL: "http://127.0.0.1:9",
      ADMIN_PORT: "0",
      ADMIN_ORIGINS: "https://admin.gnoworld.test",
    });
    const port = await listening(server);
    await until(() => server.out.stdout.includes('"event":"admin_listening"'));
    const admin = Number(/"event":"admin_listening".*"port":(\d+)/.exec(server.out.stdout)?.[1]);
    expect(admin).not.toBe(port);
    const at = (listener: number, path: string, origin?: string): Promise<Response> =>
      fetch(`http://127.0.0.1:${String(listener)}${path}`, {
        ...(origin === undefined
          ? {}
          : { method: "POST", headers: { origin, "content-type": "application/json" }, body: '{"chainId":"onyx-1"}' }),
      });
    expect((await at(port, "/api/admin/jarvis")).status).toBe(404);
    expect((await at(admin, "/api/admin/jarvis")).status).toBe(401);
    expect((await at(admin, "/api/login/challenge", "https://admin.gnoworld.test")).status).toBe(200);
    expect((await at(admin, "/api/login/challenge", "https://gnoworld.test")).status).toBe(403);
    expect((await at(port, "/api/login/challenge", "https://admin.gnoworld.test")).status).toBe(403);
    expect((await at(admin, "/api/jarvis/ask", "https://admin.gnoworld.test")).status).toBe(404);
    expect((await at(port, "/api/jarvis/ask", "https://gnoworld.test")).status).toBe(401);
    const exit = exited(server);
    server.child.kill("SIGTERM");
    expect(await exit).toBe(0);
  });

  it("lets the roles file's team alone read and change Jarvis's settings over the admin listener (ADR-0002 §6)", async () => {
    const [lead, stranger] = [wallet(), wallet()];
    const { admin, post, signIn } = await adminFor(lead, "http://127.0.0.1:9");
    const read = async (cookie: string) => {
      const answer = await fetch(`http://127.0.0.1:${String(admin)}/api/admin/jarvis`, { headers: { cookie } });
      return [answer.status, await answer.json()];
    };
    const [leads, strangers] = [await signIn(lead), await signIn(stranger)];
    const settled = { quota: 30, quotaUnnamed: 30, unlimited: [], budgets: null };
    expect(await read(leads)).toEqual([200, settled]);
    expect(await read(strangers)).toEqual([403, { error: "forbidden" }]);
    const change = { chainId: "onyx-1", change: { setting: "quota", questions: 30 } };
    expect((await post("/api/admin/jarvis/challenge", change, strangers)).status).toBe(403);
    const made = Challenge.parse(await (await post("/api/admin/jarvis/challenge", change, leads)).json());
    const proof = { nonce: made.nonce, address: lead.address, proof: lead.sign("onyx-1", made.text) };
    expect((await post("/api/admin/jarvis/change", proof, strangers)).status).toBe(403);
    expect((await post("/api/admin/jarvis/change", proof, leads)).status).toBe(200);
    expect(await read(leads)).toEqual([200, { ...settled, quota: 30 }]);
    const large = await post("/api/admin/jarvis/change", { nonce: "a".repeat(20_000) }, leads);
    expect(large.status).toBe(413);
    // The console's session lasts an hour (ADR-0002 §6; Alexis, 10g-7), its cookie too.
    const login = Challenge.parse(await (await post("/api/login/challenge", { chainId: "onyx-1" })).json());
    const signed = { nonce: login.nonce, address: lead.address, proof: lead.sign("onyx-1", login.text) };
    expect((await post("/api/login/verify", signed)).headers.get("set-cookie")).toContain("Max-Age=3600;");
  });

  it("drains the admin listener on SIGTERM: a call already begun is answered, then the process exits 0 (F5272)", async () => {
    let asked = false;
    const jarvis = createHttpServer((_, res) => {
      asked = true;
      setTimeout(() => res.writeHead(200, { "content-type": "application/json" }).end('{"ask":45,"translate":5}'), 500);
    });
    jarvis.listen(0, "127.0.0.1");
    await once(jarvis, "listening");
    try {
      const lead = wallet();
      const { server, admin, signIn } = await adminFor(
        lead,
        `http://127.0.0.1:${String((jarvis.address() as AddressInfo).port)}`,
      );
      const cookie = await signIn(lead);
      const reading = fetch(`http://127.0.0.1:${String(admin)}/api/admin/jarvis`, { headers: { cookie } });
      await until(() => asked);
      const exit = exited(server);
      server.child.kill("SIGTERM");
      const answer = await reading;
      expect([answer.status, await answer.json()]).toEqual([
        200,
        { quota: 30, quotaUnnamed: 30, unlimited: [], budgets: { ask: 45, translate: 5 } },
      ]);
      expect(await exit).toBe(0);
    } finally {
      jarvis.closeAllConnections();
      jarvis.close();
    }
  });

  it("opens the door switched off unless JARVIS is on, and asks jarvis only once it is (Alexis, off by default)", async () => {
    const origin = "https://gnoworld.test";
    const ask = async (env: Record<string, string>) => {
      const who = wallet();
      const port = await listening(
        start({
          ...settings(),
          ORIGINS: origin,
          JARVIS_URL: "http://127.0.0.1:9",
          JARVIS_DOOR_KEY_FILE: doorKeyFile(),
          JARVIS_NAMES_RPC: "https://127.0.0.1:9",
          JARVIS_UNLIMITED: who.address,
          ...env,
        }),
      );
      const posted = (path: string, body: unknown, cookie = ""): Promise<Response> =>
        fetch(`http://127.0.0.1:${String(port)}${path}`, {
          method: "POST",
          headers: { origin, "content-type": "application/json", ...(cookie === "" ? {} : { cookie }) },
          body: JSON.stringify(body),
        });
      const made = Challenge.parse(await (await posted("/api/login/challenge", { chainId: "onyx-1" })).json());
      const verified = await posted("/api/login/verify", {
        nonce: made.nonce,
        address: who.address,
        proof: who.sign("onyx-1", made.text),
      });
      const cookie = (verified.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
      const asked = await posted("/api/jarvis/ask", { question: "What is new?", room: "#bubble" }, cookie);
      return [asked.status, await asked.json()];
    };
    expect(await ask({})).toEqual([200, { status: "off" }]);
    expect(await ask({ JARVIS: "yes" })).toEqual([200, { status: "off" }]);
    // The allowlist skips the first-ask check, so the question reaches jarvis, which is not there (D13985).
    expect(await ask({ JARVIS: "on" })).toEqual([503, { error: "not_ready" }]);
  });

  it("tells any page whether Jarvis is on at GET /api/jarvis/state: on only with JARVIS_URL and JARVIS=on, never on the admin listener (10u-a)", async () => {
    const state = async (env: Record<string, string>) => {
      const port = await listening(start({ ...settings(), ORIGINS: "https://gnoworld.test", ...env }));
      const answer = await fetch(`http://127.0.0.1:${String(port)}/api/jarvis/state`);
      return [answer.status, await answer.json()];
    };
    const door = {
      JARVIS_URL: "http://127.0.0.1:9",
      JARVIS_DOOR_KEY_FILE: doorKeyFile(),
      JARVIS_NAMES_RPC: "https://127.0.0.1:9",
    };
    expect(await state({})).toEqual([200, { on: false }]);
    expect(await state({ JARVIS: "on" })).toEqual([200, { on: false }]);
    expect(await state(door)).toEqual([200, { on: false }]);
    expect(await state({ ...door, JARVIS: "yes" })).toEqual([200, { on: false }]);
    expect(await state({ ...door, JARVIS: "on" })).toEqual([200, { on: true }]);
    const server = start({
      ...settings(),
      ORIGINS: "https://gnoworld.test",
      ...door,
      JARVIS: "on",
      ADMIN_PORT: "0",
      ADMIN_ORIGINS: "https://admin.gnoworld.test",
    });
    await listening(server);
    await until(() => server.out.stdout.includes('"event":"admin_listening"'));
    const admin = Number(/"event":"admin_listening".*"port":(\d+)/.exec(server.out.stdout)?.[1]);
    expect((await fetch(`http://127.0.0.1:${String(admin)}/api/jarvis/state`)).status).toBe(404);
  });

  it("opens the digest's door beside the question's, off unless JARVIS is on (10k)", async () => {
    const origin = "https://gnoworld.test";
    const both = async (env: Record<string, string>) => {
      const port = await listening(
        start({
          ...settings(),
          ORIGINS: origin,
          JARVIS_URL: "http://127.0.0.1:9",
          JARVIS_DOOR_KEY_FILE: doorKeyFile(),
          JARVIS_NAMES_RPC: "https://127.0.0.1:9",
          ...env,
        }),
      );
      const posted = (path: string, body: unknown, cookie = ""): Promise<Response> =>
        fetch(`http://127.0.0.1:${String(port)}${path}`, {
          method: "POST",
          headers: { origin, "content-type": "application/json", ...(cookie === "" ? {} : { cookie }) },
          body: JSON.stringify(body),
        });
      const who = wallet();
      const made = Challenge.parse(await (await posted("/api/login/challenge", { chainId: "onyx-1" })).json());
      const verified = await posted("/api/login/verify", {
        nonce: made.nonce,
        address: who.address,
        proof: who.sign("onyx-1", made.text),
      });
      const cookie = (verified.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
      const realm = await posted("/api/jarvis/digest", { universe: "onyx", realm: "gno.land/r/demo/poll" }, cookie);
      return [realm.status, await realm.json()];
    };
    expect(await both({})).toEqual([200, { status: "off" }]);
    expect(await both({ JARVIS: "on" })).toEqual([503, { error: "not_ready" }]);
  });

  it(
    "serves the first signals: a guest reads none and cannot chart, an account charts a world once, a line that passed is its first words, both told on the stream (9h)",
    { timeout: 45_000 },
    async () => {
      const origin = "https://gnoworld.test";
      const ergo = await fakeErgo();
      const oper = join(folder("gnoworld-oper-"), "oper");
      writeFileSync(oper, `${PASSWORD}\n`);
      const roles = join(folder("gnoworld-roles-"), "roles.json");
      const rules = { bannedWords: [], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
      writeFileSync(
        roles,
        JSON.stringify({ team: [], trusted: [], worlds: [{ slug: "bubble", moderators: [], rules }] }),
      );
      const keys = folder("gnoworld-openai-");
      writeFileSync(join(keys, "openai"), `sk-made-up-${"k".repeat(40)}\n`);
      const hook = join(keys, "openai.mjs");
      writeFileSync(hook, OPENAI_PASSES);
      const env = {
        ...settings(),
        ORIGINS: origin,
        ROLES_FILE: roles,
        ERGO_PORT: String(ergo.port),
        ERGO_OPER_PASSWORD_FILE: oper,
        OPENAI_API_KEY_FILE: join(keys, "openai"),
      };
      const first = start(env, [...FLAGS, "--import", hook]);
      let port = await listening(first);
      const peer = await ergo.peer(0);
      await welcome(peer);
      const at = (path: string): string => `http://127.0.0.1:${String(port)}${path}`;
      const posted = (path: string, body: unknown, cookie = ""): Promise<Response> =>
        fetch(at(path), {
          method: "POST",
          headers: { origin, "content-type": "application/json", ...(cookie === "" ? {} : { cookie }) },
          body: JSON.stringify(body),
        });
      expect((await posted("/api/signals/chart", { world: "bubble" })).status).toBe(401);
      const stream = await fetch(at("/api/stream?rooms=%23bubble"));
      const reader: ReadableStreamDefaultReader<Uint8Array> | undefined = stream.body?.getReader();
      let heard = "";
      const told = async (): Promise<string[]> => {
        const kinds = (): string[] =>
          [...heard.matchAll(/event: signal\ndata: .*"kind":"(\w+)"/g)].map(([, kind = ""]) => kind);
        while (kinds().length < 2) {
          const chunk = await reader?.read();
          if (chunk === undefined || chunk.done) break;
          heard += new TextDecoder().decode(chunk.value);
        }
        return kinds().toSorted();
      };
      const who = wallet();
      const made = Challenge.parse(await (await posted("/api/login/challenge", { chainId: "onyx-1" })).json());
      const verified = await posted("/api/login/verify", {
        nonce: made.nonce,
        address: who.address,
        proof: who.sign("onyx-1", made.text),
      });
      const cookie = (verified.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
      expect(await (await posted("/api/signals/chart", { world: "bubble" }, cookie)).json()).toEqual({
        world: "bubble",
        first: true,
      });
      expect(await (await posted("/api/signals/chart", { world: "bubble" }, cookie)).json()).toEqual({
        world: "bubble",
        first: false,
      });
      const other = "g1uauvt7txunf9zeu2qyrzv0pa5uvwjlq90r3qpa";
      peer.say(message(`account=${other};msgid=m1;time=2026-11-04T12:00:00.000Z`, `${other}!u@h`, ["#bubble", "gm"]));
      expect(await told()).toEqual(["chart", "words"]);
      expect(heard).toContain(`"kind":"chart","world":"bubble","account":"${who.address}"`);
      expect(heard).toContain(`"kind":"words","world":"bubble","account":"${other}"`);
      // A restart: the page's plate learns who is first from the stream alone, so the new server tells the database's
      // firsts to a reader who comes after, before its `since`.
      await reader?.cancel();
      const gone = exited(first);
      first.child.kill("SIGTERM");
      await gone;
      port = await listening(start(env, [...FLAGS, "--import", hook]));
      const replayed = await untilSince((await fetch(at("/api/stream?rooms=%23bubble"))).body);
      const kinds = [...replayed.matchAll(/event: signal\ndata: .*"kind":"(\w+)"/g)].map(([, kind = ""]) => kind);
      expect(kinds.toSorted()).toEqual(["chart", "words"]);
      expect(replayed).toContain(who.address);
    },
  );

  it("opens no admin listener and no door without their settings", async () => {
    const server = start({ ...settings(), ORIGINS: "https://gnoworld.test" });
    const port = await listening(server);
    const asked = await fetch(`http://127.0.0.1:${String(port)}/api/jarvis/ask`, {
      method: "POST",
      headers: { origin: "https://gnoworld.test", "content-type": "application/json" },
      body: "{}",
    });
    expect(asked.status).toBe(404);
    expect(server.out.stdout).not.toContain("admin_listening");
  });

  it("stops when a rejection escapes, rather than serving on", async () => {
    const hook = join(folder("gnoworld-reject-"), "reject.mjs");
    writeFileSync(hook, 'setTimeout(() => {\n  Promise.reject(new Error("escaped"));\n}, 500);\n');
    const server = start(settings(), [...FLAGS, "--import", hook]);
    expect(await exited(server)).not.toBe(0);
    expect(server.out.stderr).toContain("escaped");
  });

  it("loads the workspace's packages as Node runs them, from their TypeScript", () => {
    const run = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        'await import("@gnoworld/schemas"); await import("@gnoworld/core"); process.stdout.write("loaded");',
      ],
      { cwd: SERVER, encoding: "utf8" },
    );
    expect(run.stderr).not.toMatch(/Error/);
    expect(run.stdout).toBe("loaded");
  });
});

// The image runs main.ts with the workspaces it imports (deploy/server/Dockerfile): each one's package.json copied before the
// install and its src after, and each src let through .dockerignore, as the web image's test asks of the app's (csp.test.ts).
it("the server's image copies each workspace the server imports, its package.json before the install and its src", () => {
  const manifest = z
    .object({ dependencies: z.record(z.string(), z.string()) })
    .parse(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")));
  const workspaces = Object.keys(manifest.dependencies)
    .filter((name) => name.startsWith("@gnoworld/"))
    .map((name) => name.slice("@gnoworld/".length));
  expect(workspaces).toEqual(expect.arrayContaining(["chain", "core", "schemas", "service"]));
  expect(workspaces).not.toContain("jarvis");
  const dockerfile = readFileSync(new URL("../../deploy/server/Dockerfile", import.meta.url), "utf8");
  expect(dockerfile).not.toMatch(/jarvis/i);
  const ignored = readFileSync(new URL("../../.dockerignore", import.meta.url), "utf8").split("\n");
  const install = dockerfile.indexOf("RUN pnpm install");
  for (const name of workspaces) {
    const copied = dockerfile.indexOf(`COPY packages/${name}/package.json packages/${name}/\n`);
    expect(copied, `packages/${name}/package.json`).toBeGreaterThan(-1);
    expect(copied, `packages/${name}/package.json before the install`).toBeLessThan(install);
    expect(dockerfile, `packages/${name}/src`).toContain(`COPY packages/${name}/src packages/${name}/src\n`);
    expect(ignored, `.dockerignore lets packages/${name}/src through`).toContain(`!packages/${name}/src`);
  }
});
