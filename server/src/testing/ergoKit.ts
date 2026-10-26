// The real Ergo's test kit (3b's spike, then each merge's real-Ergo tests): an Ergo started and stopped,
// raw IRC and WebSocket clients, logins, and the cleanup each test file runs after each test.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { expect } from "vitest";
import { startErgo, type Ergo, type ErgoOptions } from "./ergo.ts";
import { rawClient, type Raw } from "./rawClient.ts";

const CAPS =
  "message-tags server-time account-tag echo-message batch labeled-response sasl draft/chathistory " +
  "draft/event-playback draft/message-redaction account-notify extended-join multi-prefix draft/metadata-2 standard-replies " +
  "draft/read-marker";
export const ORIGIN = "http://localhost:3000";
export const ADDRESS = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
// The bcrypt hash `ergo genpasswd` printed for the passphrase "otherpw".
export const OTHERPW_HASH = "$2a$04$ETom.QBtLC14tZ.OOsG0..gz5atMe0Y3vJRPjCNYAMRwXQVTZtyxq";

// Node's WebSocket takes a second argument the standard does not have: headers (so an Origin) and protocols.
interface WsEvent {
  data?: unknown;
}
export interface Ws {
  protocol: string;
  send: (data: string) => void;
  close: () => void;
  addEventListener: (type: string, listener: (event: WsEvent) => void) => void;
}
export interface WsOptions {
  headers?: Record<string, string>;
  protocols?: string[];
}
type WsConstructor = new (url: string, options?: WsOptions) => Ws;
const NodeWebSocket = (globalThis as unknown as { WebSocket: WsConstructor }).WebSocket;

const ergos: Ergo[] = [];
const clients: Raw[] = [];
const sockets: Ws[] = [];
let pings = 0;

export const kept: string[] = [];
// A folder of the test's own, which Ergo keeps across a stop; the test removes it.
export const keptFolder = (): string => {
  const dir = mkdtempSync(joinPath(tmpdir(), "gnoworld-ergo-kept-"));
  kept.push(dir);
  return dir;
};

export const stops: (() => Promise<void>)[] = [];
export const cleanUp = async (): Promise<void> => {
  for (const stop of stops.splice(0)) await stop();
  for (const ws of sockets.splice(0)) ws.close();
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await Promise.all(ergos.splice(0).map((e) => e.stop()));
  for (const dir of kept.splice(0)) rmSync(dir, { recursive: true, force: true });
};

export const start = async (options?: ErgoOptions): Promise<Ergo> => {
  const e = await startErgo(options);
  ergos.push(e);
  return e;
};

export const open = async (e: Ergo): Promise<Raw> => {
  const c = await rawClient(e.port);
  clients.push(c);
  return c;
};

export const wsConnect = (port: number, options?: WsOptions): Promise<Ws | undefined> =>
  new Promise((resolve) => {
    const ws = new NodeWebSocket(`ws://127.0.0.1:${String(port)}/`, options);
    sockets.push(ws);
    ws.addEventListener("open", () => {
      resolve(ws);
    });
    ws.addEventListener("close", () => {
      resolve(undefined);
    });
    ws.addEventListener("error", () => {
      resolve(undefined);
    });
  });

// The same interface as rawClient, over a WebSocket: one IRC line per message.
export const wsRaw = (ws: Ws): Raw => {
  const all: string[] = [];
  let next = 0;
  ws.addEventListener("message", (event) => {
    if (typeof event.data === "string") all.push(event.data);
  });
  return {
    send: (line) => {
      ws.send(line);
    },
    expect: async (pattern, ms = 2000) => {
      const end = Date.now() + ms;
      for (;;) {
        while (next < all.length) {
          const line = all[next++];
          if (line !== undefined && pattern.test(line)) return line;
        }
        if (Date.now() > end) throw new Error(`no line matched ${String(pattern)}: ${all.join("\n")}`);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    },
    lines: () => [...all],
    close: () => {
      ws.close();
      return Promise.resolve();
    },
  };
};

// A line sent and answered proves the server handled everything sent before it on this connection.
export const sync = async (c: Raw): Promise<void> => {
  const token = `sync${String(++pings)}`;
  c.send(`PING ${token}`);
  await c.expect(new RegExp(`PONG .*${token}`));
};

export const hello = async (c: Raw, caps = CAPS): Promise<void> => {
  c.send("CAP LS 302");
  c.send(`CAP REQ :${caps}`);
  await c.expect(/CAP \S+ ACK /);
};

export const sasl = async (c: Raw, account: string, passphrase: string): Promise<string> => {
  c.send("AUTHENTICATE PLAIN");
  await c.expect(/AUTHENTICATE \+/);
  c.send(`AUTHENTICATE ${Buffer.from(`\0${account}\0${passphrase}`).toString("base64")}`);
  // Past the auth script's 9 s (AUTH_TIMEOUT): a slow script shows as Ergo's 904, never as a test's timeout.
  return c.expect(/ (903|904) /, 10_000);
};

// Registered (the MOTD's end, or its absence), unless the test waits for a refusal.
export const finish = (c: Raw, nick: string, done = / 376 | 422 /): Promise<string> => {
  c.send("CAP END");
  c.send(`NICK ${nick}`);
  c.send(`USER u 0 * :${nick}`);
  return c.expect(done);
};

export const login = async (
  e: Ergo,
  account: string,
  { pass = "pw", nick = account, caps = CAPS }: { pass?: string; nick?: string; caps?: string } = {},
): Promise<Raw> => {
  const c = await open(e);
  await hello(c, caps);
  expect(await sasl(c, account, pass)).toContain(" 903 ");
  await finish(c, nick);
  return c;
};

export const guest = async (e: Ergo, nick: string, caps = CAPS): Promise<Raw> => {
  const c = await open(e);
  await hello(c, caps);
  await finish(c, nick);
  return c;
};

export const oper = async (e: Ergo, name: string): Promise<Raw> => {
  const c = await login(e, name);
  c.send(`OPER admin ${e.operPassword}`);
  await c.expect(/ 381 /);
  return c;
};

export const join = async (c: Raw, channel: string): Promise<void> => {
  c.send(`JOIN ${channel}`);
  await c.expect(new RegExp(` 366 \\S+ ${channel} `));
};

// A room set to let accounts alone speak (+M), or not, then read back from its modes: Ergo's default since 3e,
// so the setting itself may change nothing and Ergo says nothing of it.
export const moderated = async (c: Raw, room: string, on: boolean): Promise<void> => {
  c.send(`SAMODE ${room} ${on ? "+M" : "-M"}`);
  c.send(`MODE ${room}`);
  await c.expect(new RegExp(` 324 \\S+ ${room} \\+${on ? "\\S*M" : "[^M\\s]*(\\s|$)"}`));
};

// An oper (who may create a channel) sits in #lobby.
export const lobby = async (e: Ergo): Promise<Raw> => {
  const chief = await oper(e, "chief");
  await join(chief, "#lobby");
  chief.send("SAMODE #lobby -i");
  await chief.expect(/ MODE #lobby -i/);
  return chief;
};

export const msgid = (line: string): string => {
  const found = /msgid=(\w+)/.exec(line);
  if (found?.[1] === undefined) throw new Error(`no msgid in ${line}`);
  return found[1];
};

// Sends a PRIVMSG and returns its msgid, read from the echo.
export const say = async (c: Raw, target: string, text: string): Promise<string> => {
  c.send(`PRIVMSG ${target} :${text}`);
  return msgid(await c.expect(new RegExp(`PRIVMSG ${target} :${text}$`)));
};

export const history = (c: Raw, target: string): void => {
  c.send(`CHATHISTORY LATEST ${target} * 50`);
};

// A line replayed from history carries a batch tag; the live one does not.
export const replayed = (what: string): RegExp => new RegExp(`^@\\S*batch=\\S* .*${what}`);

export const logged = (c: Raw): string => c.lines().join("\n");
