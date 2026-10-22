// A real Ergo for a test (slice 3b): the binary scripts/ergo.sh built from the pin, the one template
// the stack renders too, loopback ports of its own, and an auth script that answers by passphrase as
// the spike's did. stop() ends it and removes the folder it made; so does a test process that exits.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect, createServer, type AddressInfo } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

export interface ErgoOptions {
  origins?: string[];
  proxyFrom?: string[];
  authTimeout?: string;
  authScript?: "test" | "absent";
  dir?: string;
  env?: Record<string, string>;
  logTypes?: string;
}

export interface Ergo {
  port: number;
  wsPort: number;
  dir: string;
  pid: number;
  operPassword: string;
  log: () => string;
  authInput: () => string[];
  stop: () => Promise<void>;
}

const ROOT = new URL("../../../", import.meta.url);
const [TAG = ""] = readFileSync(new URL("deploy/ergo/VERSION", ROOT), "utf8").split(" ");
const BINARY = join(process.env["GNOWORLD_TOOLS"] ?? join(homedir(), ".cache/gnoworld-tools"), `ergo-${TAG}`, "ergo");

export async function startErgo(options: ErgoOptions = {}): Promise<Ergo> {
  const [port, wsPort] = [await freePort(), await freePort()];
  const owned = options.dir === undefined;
  const dir = options.dir ?? mkdtempSync(join(tmpdir(), "gnoworld-ergo-"));
  let operPassword: string;
  try {
    operPassword = configure(dir, [port, wsPort], options);
  } catch (error) {
    if (owned) rmSync(dir, { recursive: true, force: true });
    throw error;
  }
  const child = spawn(BINARY, ["run", "--conf", join(dir, "ircd.yaml")], {
    cwd: dir,
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (chunk: Buffer) => (log += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (log += chunk.toString()));
  // A binary that cannot start emits "error" and never "exit": either ends the wait.
  const exited = new Promise<void>((resolve) => {
    child.once("exit", () => {
      resolve();
    });
    child.once("error", () => {
      resolve();
    });
  });
  // A test process that ends without stop() leaves no Ergo behind.
  const orphan = (): void => {
    child.kill("SIGKILL");
    if (owned) rmSync(dir, { recursive: true, force: true });
  };
  process.once("exit", orphan);
  let stopping: Promise<void> | undefined;
  const stop = (): Promise<void> =>
    (stopping ??= (async () => {
      process.removeListener("exit", orphan);
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
      await exited;
      if (owned) rmSync(dir, { recursive: true, force: true });
    })());
  try {
    await Promise.race([listening(port), exited.then(() => Promise.reject(new Error(`Ergo exited:\n${log}`)))]);
  } catch (error) {
    await stop();
    throw error;
  }
  const pid = child.pid ?? 0;
  const authLog = join(dir, "auth-in.log");
  const authInput = (): string[] =>
    existsSync(authLog)
      ? readFileSync(authLog, "utf8")
          .split("\n")
          .filter((line) => line !== "")
      : [];
  return { port, wsPort, dir, pid, operPassword, log: () => log, authInput, stop };
}

// Writes the auth script and the rendered ircd.yaml into the folder; returns the oper's password.
function configure(dir: string, [port, wsPort]: readonly [number, number], options: ErgoOptions): string {
  const operPassword = randomBytes(12).toString("hex");
  const logTypes = options.logTypes ?? "* -userinput -useroutput";
  const values = {
    PLAIN: `127.0.0.1:${String(port)}`,
    WEBSOCKET: `127.0.0.1:${String(wsPort)}`,
    PROXY_FROM: options.proxyFrom ?? ["localhost"],
    ORIGINS: options.origins ?? [],
    AUTH_SCRIPT: options.authScript === "absent" ? join(dir, "absent-auth") : writeAuthScript(dir),
    AUTH_TIMEOUT: options.authTimeout ?? "9s",
    OPER_HASH: hash(operPassword),
    DATABASE: join(dir, "ircd.db"),
    HISTORY: join(dir, "history.db"),
    LOCK: join(dir, "ircd.lock"),
    LOG_TYPES: logTypes,
    LOG_LEVEL: logTypes === "*" ? "debug" : "info",
  };
  writeFileSync(join(dir, "ircd.yaml"), render(values));
  return operPassword;
}

// Each {{NAME}} of the template, as a JSON value (valid YAML); a name left or not filled is refused.
function render(values: Record<string, string | string[]>): string {
  const template = readFileSync(new URL("deploy/ergo/ircd.yaml.tmpl", ROOT), "utf8");
  const text = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`ircd.yaml.tmpl: no value for {{${name}}}`);
    return JSON.stringify(value);
  });
  const unused = Object.keys(values).filter((name) => !template.includes(`{{${name}}}`));
  if (unused.length > 0) throw new Error(`ircd.yaml.tmpl: no place for ${unused.join(", ")}`);
  return text;
}

function hash(password: string): string {
  const run = spawnSync(BINARY, ["genpasswd"], { input: `${password}\n`, encoding: "utf8" });
  const line = run.stdout.trim().split("\n").at(-1) ?? "";
  if (!line.startsWith("$2")) throw new Error(`ergo genpasswd gave no hash:\n${run.stderr}`);
  return line;
}

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  server.close();
  await once(server, "close");
  return port;
}

async function listening(port: number): Promise<void> {
  const end = Date.now() + 10_000;
  for (;;) {
    const socket = connect(port, "127.0.0.1");
    // Not events.once: its "connect" rejects on the refusal this loop waits through.
    const opened = await new Promise<boolean>((resolve) => {
      socket.once("connect", () => {
        resolve(true);
      });
      socket.once("error", () => {
        resolve(false);
      });
    });
    socket.destroy();
    if (opened) return;
    if (Date.now() > end) throw new Error(`Ergo did not listen on ${String(port)} within 10 s`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function writeAuthScript(dir: string): string {
  const path = join(dir, "auth.mjs");
  writeFileSync(path, `#!${process.execPath}\n${AUTH_SCRIPT.replace("LOG", JSON.stringify(join(dir, "auth-in.log")))}`);
  chmodSync(path, 0o755);
  return path;
}

// The spike's auth.py in Node: one JSON line in, one answer out, chosen by the passphrase.
const AUTH_SCRIPT = `import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";
const lines = createInterface({ input: process.stdin });
const line = await new Promise((resolve) => lines.once("line", resolve));
lines.close();
appendFileSync(LOG, line + "\\n");
const { accountName = "", passphrase = "" } = JSON.parse(line);
const say = (answer) => process.stdout.write(JSON.stringify(answer) + "\\n");
if (passphrase === "pw") say({ success: true, accountName });
else if (passphrase === "rename") say({ success: true, accountName: "renamed-" + accountName });
else if (passphrase === "empty") say({ success: true });
else if (passphrase === "slow") setTimeout(() => say({ success: true }), 30000);
else if (passphrase === "garbage") process.stdout.write("not json\\n");
else if (passphrase === "err") say({ success: false, error: "boom" });
else if (passphrase === "crash") process.exit(3);
else say({ success: false });
`;
