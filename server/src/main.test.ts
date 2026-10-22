import { spawn, spawnSync, type ChildProcessByStdio } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { Challenge, Ticket } from "@gnoworld/schemas";
import { afterEach, describe, expect, it } from "vitest";
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

describe("the server's process", () => {
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
    expect((await call("me", { headers: { cookie } })).status).toBe(401);
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
