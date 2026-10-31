import { spawn, spawnSync, type ChildProcessByStdio } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { connect, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { Challenge, Ticket } from "@gnoworld/schemas";
import { afterEach, describe, expect, it } from "vitest";
import { fakeErgo, message, PASSWORD, welcome } from "./testing/fakeErgo.ts";
import { wallet } from "./testing/signer.ts";

interface Server {
  child: ChildProcessByStdio<null, Readable, Readable>;
  out: { stdout: string; stderr: string };
}

const SERVER = fileURLToPath(new URL("..", import.meta.url));
const ENTRY = fileURLToPath(new URL("main.ts", import.meta.url));
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
    expect(peer.lines.filter((line) => line.startsWith("JOIN "))).toEqual(["JOIN #bubble,#earth"]);
    const left = once(peer.socket, "close");
    server.child.kill("SIGTERM");
    expect(await exited(server)).toBe(0);
    await left;
  });

  it("never mutes the roles file's team, mutes another hidden three times, and keeps the strikes' index (3k)", async () => {
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
  });

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
