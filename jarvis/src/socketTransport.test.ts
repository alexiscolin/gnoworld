import { EventEmitter } from "node:events";
import { createServer, Socket } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startGnomcp, type Gnomcp } from "./gnomcp.ts";
import { readOnlyProfiles, type Scenario } from "./testing/fakeGnomcp.ts";
import { fakeGnomcpTcp } from "./testing/fakeGnomcpTcp.ts";
import { capture } from "./testing/kit.ts";
import { SocketTransport } from "./socketTransport.ts";

// gnomcp reached over TCP (10u-g2): the same MCP, the same start checks, timeouts, bound and restarts as over stdio,
// tested against a fake on a local socket.
const PROFILES = { read: ["onyx", "betanet"], indexed: ["onyx"] };
const opened: Gnomcp[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((gnomcp) => gnomcp.close()));
});

const setupOf = async (scenario: Scenario = {}, extra: { callTimeoutMs?: number; now?: () => number } = {}) => {
  const tcp = await fakeGnomcpTcp(scenario);
  const { log, events, raw } = capture();
  return { ...tcp, events, raw, setup: { address: tcp.address, profiles: PROFILES, log, ...extra } };
};
const start = async (scenario: Scenario = {}, extra: { callTimeoutMs?: number; now?: () => number } = {}) => {
  const made = await setupOf(scenario, extra);
  const gnomcp = await startGnomcp(made.setup);
  opened.push(gnomcp);
  return { ...made, gnomcp };
};
const message = async (scenario: Scenario) => {
  const made = await setupOf(scenario);
  return startGnomcp(made.setup).then(
    (gnomcp) => {
      opened.push(gnomcp);
      return "started";
    },
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
};
const render = (gnomcp: Gnomcp) => gnomcp.call("gno_render", { profile: "onyx", realm: "gno.land/r/x" });

describe("gnomcp over TCP", () => {
  it("starts over one connection, checks it as over stdio, and gives a read's text", async () => {
    const { gnomcp, fake, connections } = await start();
    expect(await gnomcp.call("gno_status", { profile: "onyx" })).toEqual({
      ok: true,
      text: 'gno_status {"profile":"onyx"}',
      isError: false,
    });
    expect(connections()).toBe(1);
    expect(fake.requests().map(({ method }) => method)).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/list",
      "tools/call",
      "tools/call",
    ]);
  });

  it("refuses a call outside the table before it reaches the socket", async () => {
    const { gnomcp, fake } = await start();
    expect(await gnomcp.call("gno_call", { profile: "onyx" })).toEqual({ ok: false, reason: "refused" });
    expect(fake.requests().filter(({ method }) => method === "tools/call")).toHaveLength(1);
  });

  it("refuses to start when a profile is not read-only", async () => {
    const profiles = readOnlyProfiles().map((profile) => ({ ...profile, kind: "testnet" }));
    expect(await message({ profiles })).toMatch(/not read-only/);
  });

  it("refuses to start when one of our reads is missing", async () => {
    expect(await message({ tools: [] })).toMatch(/no tool gno_packages/);
  });

  it("refuses a server that is not gnomcp 0.11.0", async () => {
    expect(await message({ server: { name: "gnomcp", version: "0.12.0" } })).toMatch(/not gnomcp 0.11.0/);
  });

  it("refuses to start when nothing listens", async () => {
    const { log } = capture();
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
    const address = closed.address();
    if (address === null || typeof address === "string") throw new Error("no port");
    await new Promise((resolve) => closed.close(resolve));
    await expect(
      startGnomcp({ address: { host: "127.0.0.1", port: address.port }, profiles: PROFILES, log }),
    ).rejects.toThrow();
  });

  it("ends a call that passes its time as a timeout", async () => {
    const { gnomcp } = await start({ slow: ["gno_status"] }, { callTimeoutMs: 200 });
    expect(await gnomcp.call("gno_status", { profile: "onyx" })).toEqual({ ok: false, reason: "timeout" });
  });

  it("starts again at the next call once the connection dropped, and checks it again", async () => {
    const { gnomcp, connections } = await start({ crash: { tool: "gno_render", starts: 1 } });
    expect(await render(gnomcp)).toMatchObject({ ok: false });
    expect(await gnomcp.call("gno_status", { profile: "onyx" })).toMatchObject({ ok: true });
    expect(connections()).toBe(2);
  });

  it("gives up after 3 starts in 10 minutes, and starts again once the window passed", async () => {
    const clock = { now: Date.parse("2026-11-04T12:00:00.000Z") };
    const { gnomcp, events } = await start({ crash: { tool: "gno_render", starts: 99 } }, { now: () => clock.now });
    for (let crash = 0; crash < 4; crash += 1) expect(await render(gnomcp)).toEqual({ ok: false, reason: "down" });
    expect(events()).toContainEqual({ event: "jarvis_gnomcp_down", reason: "restarts" });
    clock.now += 11 * 60_000;
    expect(await gnomcp.call("gno_status", { profile: "onyx" })).toMatchObject({ ok: true });
  });

  it("drops the connection when one message passes 1 MiB, spending none of the restarts", async () => {
    const answers = { gno_render: { content: [{ type: "text", text: "z".repeat(1_100_000) }] } };
    const { gnomcp, connections, events } = await start({ answers });
    for (let drop = 0; drop < 4; drop += 1) expect(await render(gnomcp)).toEqual({ ok: false, reason: "down" });
    expect(await gnomcp.call("gno_status", { profile: "onyx" })).toMatchObject({ ok: true });
    expect(connections()).toBe(5);
    expect(events()).not.toContainEqual({ event: "jarvis_gnomcp_down", reason: "restarts" });
    expect(events()).toContainEqual({ event: "jarvis_gnomcp_down", reason: "oversized" });
  });

  it("closes its connection, which the server sees close, and answers down after", async () => {
    const { gnomcp, open } = await start();
    expect(open()).toBe(1);
    await gnomcp.close();
    await vi.waitFor(() => {
      expect(open()).toBe(0);
    });
    expect(await gnomcp.call("gno_status", { profile: "onyx" })).toEqual({ ok: false, reason: "down" });
  });
});

// The transport on its own, against a socket server written for each test: what it does with no handler set, its
// buffer on a new connection, a send that waits for the socket, and the socket's own settings.
const listening = async (onConnection: (socket: Socket, at: number) => void) => {
  const sockets: Socket[] = [];
  const server = createServer((socket) => {
    sockets.push(socket);
    onConnection(socket, sockets.length);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const bound = server.address();
  if (bound === null || typeof bound === "string") throw new Error("no port");
  const address = { host: "127.0.0.1", port: bound.port };
  closers.push(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  });
  return { address, sockets };
};
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(closers.splice(0).map((close) => close()));
});
const options = { maxBufferSize: 1024 * 1024, connectMs: 5_000 };
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const ping = { jsonrpc: "2.0", method: "ping" } as const;
const lineOf = (message: unknown) => `${JSON.stringify(message)}\n`;

describe("the socket transport on its own", () => {
  it("sets the socket to send at once and to keep alive every 30 s", async () => {
    const noDelay = vi.spyOn(Socket.prototype, "setNoDelay");
    const keepAlive = vi.spyOn(Socket.prototype, "setKeepAlive");
    const { address } = await listening(() => undefined);
    const transport = new SocketTransport(address, options);
    await transport.start();
    expect(noDelay).toHaveBeenCalledWith(true);
    expect(keepAlive).toHaveBeenCalledWith(true, 30_000);
    await transport.close();
  });

  it("keeps a connected socket open past its connect time", async () => {
    const { address } = await listening(() => undefined);
    const transport = new SocketTransport(address, { ...options, connectMs: 50 });
    const closed = vi.fn();
    transport.onclose = closed;
    await transport.start();
    await pause(200);
    expect(closed).not.toHaveBeenCalled();
    await expect(transport.send(ping)).resolves.toBeUndefined();
    await transport.close();
  });

  it("refuses a send that is not connected, and closes without a socket", async () => {
    const { address } = await listening(() => undefined);
    const transport = new SocketTransport(address, options);
    await expect(transport.send(ping)).rejects.toThrow("Not connected");
    await expect(transport.close()).resolves.toBeUndefined();
  });

  it("works with no handler set: a message, a bad line, a refusal to connect and a close raise nothing", async () => {
    const { address } = await listening((socket) => socket.write(`${lineOf(ping)}{"not":"rpc"}\n`));
    const transport = new SocketTransport(address, options);
    await transport.start();
    await pause(100);
    await transport.close();
    await pause(50);
    const gone = new SocketTransport({ host: "127.0.0.1", port: 1 }, options);
    await expect(gone.start()).rejects.toThrow();
  });

  it("gives each message to its handler, a bad line to the error handler, and a handler apart from the others", async () => {
    const { address } = await listening((socket) => socket.write(`${lineOf(ping)}{"not":"rpc"}\n`));
    const transport = new SocketTransport(address, options);
    const messages: unknown[] = [];
    const errors: Error[] = [];
    transport.onmessage = (message) => messages.push(message);
    transport.onerror = (error) => errors.push(error);
    await transport.start();
    await vi.waitFor(() => {
      expect(errors).toHaveLength(1);
    });
    expect(messages).toEqual([ping]);
    await transport.close();
  });

  it("reports no error for a message when no message handler is set", async () => {
    const { address } = await listening((socket) => socket.write(lineOf(ping)));
    const transport = new SocketTransport(address, options);
    const errors: Error[] = [];
    transport.onerror = (error) => errors.push(error);
    await transport.start();
    await pause(100);
    expect(errors).toEqual([]);
    await transport.close();
  });

  it("ends the connection with the buffer's error for a message past its bound, whoever listens", async () => {
    const { address } = await listening((socket) => socket.write("x".repeat(5_000)));
    const bare = new SocketTransport(address, { ...options, maxBufferSize: 1_000 });
    await bare.start();
    await pause(100);
    const bounded = new SocketTransport(address, { ...options, maxBufferSize: 1_000 });
    const errors: Error[] = [];
    const closed = vi.fn();
    bounded.onerror = (error) => errors.push(error);
    bounded.onclose = closed;
    await bounded.start();
    await vi.waitFor(() => {
      expect(closed).toHaveBeenCalled();
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
  });

  it("forgets a half message when its connection closes: the next connection starts a message afresh", async () => {
    const { address } = await listening((socket, at) => {
      if (at === 1) {
        socket.write('{"jsonrpc":"2.0",');
        socket.end();
      } else socket.write(`"method":"half"}\n${lineOf(ping)}`);
    });
    const transport = new SocketTransport(address, options);
    const messages: unknown[] = [];
    const errors: Error[] = [];
    const closed = vi.fn();
    transport.onmessage = (message) => messages.push(message);
    transport.onerror = (error) => errors.push(error);
    transport.onclose = closed;
    await transport.start();
    await vi.waitFor(() => {
      expect(closed).toHaveBeenCalledOnce();
    });
    await transport.start();
    await vi.waitFor(() => {
      expect(messages.length + errors.length).toBeGreaterThan(0);
    });
    await vi.waitFor(() => {
      expect(messages).toContainEqual(ping);
    });
    expect(messages).not.toContainEqual({ jsonrpc: "2.0", method: "half" });
    await transport.close();
  });

  it("waits for the socket to drain before a big send resolves", async () => {
    const { address, sockets } = await listening((socket) => socket.pause());
    const transport = new SocketTransport(address, options);
    await transport.start();
    const settled = vi.fn();
    const sending = transport
      .send({ jsonrpc: "2.0", method: "big", params: { text: "z".repeat(40 * 1024 * 1024) } })
      .then(settled);
    await pause(200);
    expect(settled).not.toHaveBeenCalled();
    for (const socket of sockets) socket.resume();
    await sending;
    expect(settled).toHaveBeenCalledOnce();
    await transport.close();
  });
});

// The connect time: a socket that does not connect in time is destroyed with its own error, which ends the start. The network
// is not there to be slow on demand, so the socket is a fake that holds the callback it was given (a fresh module, net mocked).
describe("the socket transport's connect time", () => {
  afterEach(() => {
    vi.doUnmock("node:net");
    vi.resetModules();
  });

  it("ends the start with a connect timeout, and tells its handlers", async () => {
    let timeout: (() => void) | undefined;
    vi.resetModules();
    vi.doMock("node:net", () => ({
      connect: () => {
        const socket = Object.assign(new EventEmitter(), {
          setNoDelay: () => socket,
          setKeepAlive: () => socket,
          setTimeout: (_ms: number, callback?: () => void) => {
            if (callback !== undefined) timeout = callback;
            return socket;
          },
          destroy: (error?: Error) => {
            if (error !== undefined) socket.emit("error", error);
            socket.emit("close");
            return socket;
          },
        });
        return socket;
      },
    }));
    const fresh = await import("./socketTransport.ts");
    const transport = new fresh.SocketTransport({ host: "10.0.0.1", port: 7 }, { maxBufferSize: 1024, connectMs: 10 });
    const errors: Error[] = [];
    const closed = vi.fn();
    transport.onerror = (error) => errors.push(error);
    transport.onclose = closed;
    const starting = transport.start();
    expect(timeout).toBeTypeOf("function");
    timeout?.();
    await expect(starting).rejects.toThrow("connect timeout");
    expect(errors.map((error) => error.message)).toEqual(["connect timeout"]);
    expect(closed).toHaveBeenCalledOnce();
  });
});
