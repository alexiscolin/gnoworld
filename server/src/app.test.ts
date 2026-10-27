import { once } from "node:events";
import { connect, type AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { BODY_LIMIT, listen, makeApp, stop } from "./app.ts";
import { logger } from "./log.ts";

const PEPPER = "a-pepper-of-forty-characters-0123456789";
const TOKEN = "planted-token-5f2b";
const TICKET = "planted-ticket-9c1d";
const SIGNATURE = "planted-signature-77ae";
const ADDRESS = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
// Short, so a test waits a fraction of a second for what the real ones take seconds to do.
const QUICK = { headers: 200, request: 400, keepAlive: 200, check: 50 };

const setup = (ready = (): boolean => true): { app: ReturnType<typeof makeApp>; lines: string[] } => {
  const lines: string[] = [];
  return {
    app: makeApp(
      logger(PEPPER, (line) => lines.push(line)),
      ready,
    ),
    lines,
  };
};

const SECURE = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "strict-transport-security": "max-age=15552000; includeSubDomains",
  "referrer-policy": "no-referrer",
  "cross-origin-resource-policy": "same-origin",
};
const secured = (response: Response): void => {
  for (const [name, value] of Object.entries(SECURE)) expect(response.headers.get(name)).toBe(value);
  expect(response.headers.get("x-powered-by")).toBeNull();
};

describe("the server's app", () => {
  it("answers /health while the process runs, drained or not", async () => {
    const { app } = setup(() => false);
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    secured(response);
  });

  it("answers /ready with 200 until the server drains, then 503", async () => {
    let draining = false;
    const { app } = setup(() => !draining);
    const ready = await app.request("/ready");
    expect([ready.status, await ready.text()]).toEqual([200, "ready"]);
    draining = true;
    const drained = await app.request("/ready");
    expect(drained.status).toBe(503);
    expect(await drained.json()).toEqual({ error: "not_ready" });
  });

  it("answers an unknown path with 404 and a code, and neither answers nor logs the path", async () => {
    const { app, lines } = setup();
    const response = await app.request(`/${TOKEN}`);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe(JSON.stringify({ error: "not_found" }));
    secured(response);
    expect(lines.join("")).not.toContain(TOKEN);
  });

  it("keeps the body limit small", () => {
    expect(BODY_LIMIT).toBeLessThanOrEqual(65_536);
  });

  it("refuses a body over the limit with 413, by its length or as it streams, and takes one at the limit", async () => {
    const { app, lines } = setup();
    app.post("/echo", async (c) => c.text(String((await c.req.text()).length)));
    const over = await app.request(`/${TOKEN}`, { method: "POST", body: "x".repeat(BODY_LIMIT + 1) });
    expect(over.status).toBe(413);
    expect(await over.json()).toEqual({ error: "too_large" });
    secured(over);
    const declared = await app.request("/echo", {
      method: "POST",
      headers: { "content-length": String(BODY_LIMIT + 1) },
      body: "x",
    });
    expect(declared.status).toBe(413);
    const stream = new Blob(["x".repeat(BODY_LIMIT + 1)]).stream();
    const streamed = await app.request("/echo", { method: "POST", body: stream, duplex: "half" });
    expect(streamed.status).toBe(413);
    const at = await app.request("/echo", { method: "POST", body: "x".repeat(BODY_LIMIT) });
    expect(await at.text()).toBe(String(BODY_LIMIT));
    expect(lines.join("")).not.toContain(TOKEN);
  });

  it.each([
    ["an error", new TypeError(`failed on ${TOKEN}`), "TypeError"],
    ["a string", `failed on ${TOKEN}`, "string"],
  ])(
    "answers %s thrown with a generic 500, and logs it without what the request carried",
    async (_, thrown: unknown, name) => {
      const { app, lines } = setup();
      app.post("/fails/:id", () => {
        throw thrown;
      });
      const response = await app.request(`/fails/${TOKEN}?ticket=${TICKET}`, {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}`, cookie: `session=${TOKEN}` },
        body: JSON.stringify({ signature: SIGNATURE, address: ADDRESS }),
      });

      expect(response.status).toBe(500);
      expect(await response.text()).toBe(JSON.stringify({ error: "internal" }));
      secured(response);
      const logged = lines.join("");
      expect(logged).toContain('"event":"failed"');
      expect(logged).toContain(`"error":"${name}"`);
      expect(logged).toContain('"route":"/fails/:id"');
      for (const planted of [TOKEN, TICKET, SIGNATURE, ADDRESS, "failed on", "at "]) {
        expect(logged).not.toContain(planted);
      }
    },
  );
});

describe("listen", () => {
  const servers: Awaited<ReturnType<typeof listen>>[] = [];
  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
  });
  const start = async (timeouts = QUICK): Promise<number> => {
    const server = await listen(setup().app, { port: 0, host: "127.0.0.1" }, timeouts);
    servers.push(server);
    return (server.address() as AddressInfo).port;
  };
  const socket = async (
    port: number,
  ): Promise<{ closed: Promise<unknown>; said: () => string; write: (s: string) => void }> => {
    const s = connect(port, "127.0.0.1");
    let said = "";
    s.on("data", (chunk: Buffer) => (said += chunk.toString()));
    // A server that cuts a client may reset its socket: what is said counts, then the close.
    s.on("error", (error) => (said += `[${error.message}]`));
    const closed = new Promise((resolve) => s.once("close", resolve));
    await once(s, "connect");
    return { closed, said: () => said, write: (text) => s.write(text) };
  };

  it("sets the HTTP server's own timeouts: headers in 5 s, a request in 10 s, an idle connection 5 s", async () => {
    const server = await listen(setup().app, { port: 0, host: "127.0.0.1" });
    servers.push(server);
    expect([server.headersTimeout, server.requestTimeout, server.keepAliveTimeout]).toEqual([5_000, 10_000, 5_000]);
  });

  it("answers over HTTP with the app", async () => {
    const port = await start();
    expect((await fetch(`http://127.0.0.1:${String(port)}/health`)).status).toBe(200);
  });

  it("cuts a client that never finishes its headers, at the header timeout", async () => {
    const client = await socket(await start());
    client.write("GET /health HTTP/1.1\r\nHost: localhost\r\n");
    await client.closed;
    expect(client.said()).toMatch(/^HTTP\/1\.1 408 /);
  });

  it("closes a kept-alive connection left idle, at the keep-alive timeout", async () => {
    const client = await socket(await start());
    client.write("GET /health HTTP/1.1\r\nHost: localhost\r\n\r\n");
    await client.closed;
    expect(client.said()).toMatch(/^HTTP\/1\.1 200 /);
  });

  it("logs a body its client dropped mid-way as aborted, never as the server's 500 (the max review)", async () => {
    const { app, lines } = setup();
    app.post("/echo", async (c) => c.text(String((await c.req.text()).length)));
    const server = await listen(app, { port: 0, host: "127.0.0.1" });
    servers.push(server);
    const { port } = server.address() as AddressInfo;
    for (const [head, part] of [
      ["Content-Length: 100", "x".repeat(10)],
      ["Transfer-Encoding: chunked", "a\r\nxxxxxxxxxx\r\n"],
      ["Content-Length: 100", ""],
    ]) {
      const s = connect(port, "127.0.0.1");
      await once(s, "connect");
      s.write(`POST /echo HTTP/1.1\r\nHost: localhost\r\n${String(head)}\r\n\r\n${String(part)}`);
      s.destroy();
    }
    await expect
      .poll(() => lines.filter((line) => line.includes('"event":"aborted"')).length, { timeout: 5_000 })
      .toBe(3);
    expect(lines.join("\n")).not.toContain('"status":500');
    const parsed = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    for (const entry of parsed)
      expect(
        Object.keys(entry)
          .filter((key) => !["time", "event"].includes(key))
          .sort(),
      ).toEqual(["method", "route"]);
    expect(parsed.map(({ method, route }) => [method, route])).toEqual(Array(3).fill(["POST", "/echo"]));
  });

  it("stops even while a client stalls in its headers, which close() alone waits on for ever", async () => {
    // A long keep-alive, so nothing but the stop cuts the stalled request: close() stops the header checks.
    const client = await socket(await start({ ...QUICK, keepAlive: 60_000 }));
    // One write: once the first answer is back, the server has begun reading the second request.
    client.write("GET /health HTTP/1.1\r\nHost: localhost\r\n\r\nGET /health HTTP/1.1\r\n");
    await until(() => client.said().includes("\r\n\r\nok"));
    const server = servers[0];
    if (server === undefined) throw new Error("no server started");
    const started = performance.now();
    await new Promise<void>((resolve) => {
      stop(server, resolve, 300);
    });
    await client.closed;
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

const until = async (seen: () => boolean): Promise<void> => {
  while (!seen()) await new Promise((resolve) => setTimeout(resolve, 10));
};
