import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { connect } from "node:net";
import { ApiError } from "@gnoworld/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import { serve, type Handler, type Routes } from "./http.ts";
import { capture } from "./testing/kit.ts";

const opened: { close: () => Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((served) => served.close()));
});

// A table of routes whose handlers the test gives, served on a port of its own; its address and its log.
const served = async (routes: Routes, ready = () => true) => {
  const { log, events, raw } = capture();
  const jarvis = await serve(routes, { host: "127.0.0.1", port: 0, names: ["127.0.0.1"], log, ready });
  const address = jarvis.server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  const url = `http://127.0.0.1:${String(address.port)}`;
  opened.push({
    close: () =>
      new Promise((resolve) => {
        jarvis.server.closeAllConnections();
        jarvis.server.close(() => {
          resolve();
        });
      }),
  });
  return { url, jarvis, events, raw };
};
const echo: Handler = (body) => Promise.resolve({ status: 200, body: { echoed: body } });
const post = (url: string, body: string, type = "application/json") =>
  fetch(url, { method: "POST", headers: { "content-type": type }, body });
const refusal = async (response: Response) => ({
  status: response.status,
  body: ApiError.parse(await response.json()),
});
// A POST over a raw request the test writes as it likes: its headers, then what `write` sends, never its end; the
// answer's status once it arrives, and the request to destroy.
const unended = (
  url: string,
  { headers, path }: { headers: Record<string, string>; path?: string },
  write: (sent: ReturnType<typeof httpRequest>) => void,
) => {
  const target = new URL(url);
  const sent = httpRequest({
    host: target.hostname,
    port: target.port,
    path: path ?? target.pathname,
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
  });
  sent.on("error", () => undefined);
  const answer = new Promise<{ status: number | undefined; connection: string | undefined }>((resolve) => {
    sent.on("response", (response) => {
      response.resume();
      resolve({ status: response.statusCode, connection: response.headers.connection });
    });
  });
  write(sent);
  return { sent, status: answer.then(({ status }) => status), connection: answer.then(({ connection }) => connection) };
};

describe("jarvis's HTTP face: what it answers", () => {
  it("answers a route's handler with its status and its body as JSON, its connection kept, and logs nothing", async () => {
    const { url, events } = await served({ "/echo": { POST: echo } });
    const response = await post(`${url}/echo`, JSON.stringify({ question: "hi" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("connection")).toBe("keep-alive");
    expect(await response.json()).toEqual({ echoed: { question: "hi" } });
    expect(events()).toEqual([]);
  });

  it("refuses a body that is no UTF-8 as refused, never handing it on", async () => {
    const handler = vi.fn(echo);
    const { url } = await served({ "/echo": { POST: handler } });
    const bytes = new Uint8Array([0x22, 0xff, 0xfe, 0x22]);
    const response = await fetch(`${url}/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: bytes,
    });
    expect(await refusal(response)).toEqual({ status: 400, body: { error: "refused" } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("hands a GET's handler no body", async () => {
    const handler = vi.fn(echo);
    const { url } = await served({ "/read": { GET: handler } });
    expect(await (await fetch(`${url}/read`)).json()).toEqual({});
    expect(handler.mock.calls[0]?.[0]).toBeUndefined();
  });

  it("reads the path alone, its query left aside", async () => {
    const { url } = await served({ "/echo": { POST: echo } });
    expect((await post(`${url}/echo?debug=1`, "{}")).status).toBe(200);
  });

  it.each(["/", "/echo/", "/ECHO", "/echo/x", "/__proto__", "/constructor", "/toString", "/hasOwnProperty", "//echo"])(
    "refuses %s, no route of its table, as not_found",
    async (path) => {
      const handler = vi.fn(echo);
      const { url } = await served({ "/echo": { POST: handler } });
      expect(await refusal(await post(`${url}${path}`, "{}"))).toEqual({ status: 404, body: { error: "not_found" } });
      expect(handler).not.toHaveBeenCalled();
    },
  );

  // fetch would resolve these before it sends them: written raw, as any client may (F5287).
  it.each(["//host/echo", "http://other.host/echo", "/x/../echo", "/./echo", "/%65cho", "//[", "*"])(
    "refuses the target %s, which is not the path /echo itself, as not_found",
    async (target) => {
      const handler = vi.fn(echo);
      const { url } = await served({ "/echo": { POST: handler } });
      const write = (request: ReturnType<typeof httpRequest>) => {
        request.end("{}");
      };
      const { sent, status } = unended(url, { headers: { "content-length": "2" }, path: target }, write);
      expect(await status).toBe(404);
      sent.destroy();
      expect(handler).not.toHaveBeenCalled();
    },
  );

  // A page of another site a browser was steered to (DNS rebinding) names its own host: refused (F5288).
  it.each([
    "evil.example:8081",
    "evil.example",
    "127.0.0.1.evil.example",
    "127.0.0.1@evil.example",
    "localhost",
    ":8081",
  ])("refuses a request whose Host is %j, no name jarvis answers to, as not_found", async (host) => {
    const handler = vi.fn(echo);
    const { url, events } = await served({ "/echo": { POST: handler } });
    const write = (request: ReturnType<typeof httpRequest>) => {
      request.end("{}");
    };
    const { sent, status } = unended(`${url}/echo`, { headers: { host, "content-length": "2" } }, write);
    expect(await status).toBe(404);
    sent.destroy();
    expect(handler).not.toHaveBeenCalled();
    expect(events()).toContainEqual({
      event: "jarvis_refused",
      route: "<unknown>",
      method: "POST",
      status: 404,
      error: "not_found",
    });
  });

  it("refuses a request that names no Host at all", async () => {
    const { url } = await served({ "/echo": { GET: echo } });
    const socket = connect(Number(new URL(url).port), "127.0.0.1");
    socket.on("error", () => undefined);
    await once(socket, "connect");
    let said = "";
    socket.on("data", (chunk: Buffer) => (said += chunk.toString()));
    const closed = new Promise((resolve) => socket.on("close", resolve));
    socket.write("GET /echo HTTP/1.0\r\n\r\n");
    await closed;
    expect(said).toMatch(/^HTTP\/1\.1 404 /);
  });

  it("answers each of its names whatever their case and port, an address in brackets among them", async () => {
    const { log } = capture();
    const jarvis = await serve(
      { "/echo": { POST: echo } },
      { host: "127.0.0.1", port: 0, names: ["jarvis", "[fd00::7]"], log, ready: () => true },
    );
    opened.push({
      close: () =>
        new Promise((resolve) => {
          jarvis.server.closeAllConnections();
          jarvis.server.close(() => {
            resolve();
          });
        }),
    });
    const address = jarvis.server.address();
    if (address === null || typeof address === "string") throw new Error("no port");
    const write = (request: ReturnType<typeof httpRequest>) => {
      request.end("{}");
    };
    const at = `http://127.0.0.1:${String(address.port)}/echo`;
    for (const host of ["jarvis", "JARVIS:8081", "Jarvis:1", "[fd00::7]", "[FD00::7]:8081"]) {
      const { sent, status } = unended(at, { headers: { host, "content-length": "2" } }, write);
      expect(await status).toBe(200);
      sent.destroy();
    }
    // A name inside a Host that is no name, before or after: never ours.
    for (const host of ["evil.example/jarvis", "jarvis/evil.example", "jarvis:", "[fd00::7", "[zz]", "[]"]) {
      const { sent, status } = unended(at, { headers: { host, "content-length": "2" } }, write);
      expect(await status).toBe(404);
      sent.destroy();
    }
  });

  it.each(["GET", "PUT", "DELETE", "PATCH", "OPTIONS"])(
    "refuses %s on a route that takes POST alone, as unsupported, naming what it takes",
    async (method) => {
      const handler = vi.fn(echo);
      const { url } = await served({ "/echo": { POST: handler } });
      const response = await fetch(`${url}/echo`, { method });
      expect(await refusal(response)).toEqual({ status: 405, body: { error: "unsupported" } });
      expect(response.headers.get("allow")).toBe("POST");
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it("names every method a route takes when it refuses another", async () => {
    const { url } = await served({ "/both": { GET: echo, POST: echo } });
    const response = await fetch(`${url}/both`, { method: "DELETE" });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, POST");
  });

  it("refuses a HEAD, which no route takes", async () => {
    const { url } = await served({ "/read": { GET: echo } });
    const response = await fetch(`${url}/read`, { method: "HEAD" });
    expect(response.status).toBe(405);
  });

  it.each([["text/plain"], ["application/x-www-form-urlencoded"], ["application/jsonp"], ["multipart/form-data"]])(
    "refuses a POST whose body is %s, as unsupported, before it reads it",
    async (type) => {
      const handler = vi.fn(echo);
      const { url } = await served({ "/echo": { POST: handler } });
      expect(await refusal(await post(`${url}/echo`, "{}", type))).toEqual({
        status: 415,
        body: { error: "unsupported" },
      });
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it("refuses a POST that names no type", async () => {
    const { url } = await served({ "/echo": { POST: echo } });
    const response = await fetch(`${url}/echo`, { method: "POST", body: new Uint8Array([123, 125]) });
    expect(response.status).toBe(415);
  });

  it.each([
    "application/json; charset=utf-8",
    "Application/JSON",
    "application/json;charset=UTF-8",
    "application/json ; q=1",
  ])("takes JSON written %s", async (type) => {
    const { url } = await served({ "/echo": { POST: echo } });
    expect((await post(`${url}/echo`, "[1]", type)).status).toBe(200);
  });

  it.each([
    ["no JSON", "{question:"],
    ["an empty body", ""],
    ["JSON and more", '{"a":1} {"b":2}'],
  ])("refuses a body that is %s, as refused", async (_case, body) => {
    const handler = vi.fn(echo);
    const { url } = await served({ "/echo": { POST: handler } });
    expect(await refusal(await post(`${url}/echo`, body))).toEqual({ status: 400, body: { error: "refused" } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("takes a body of 256 KiB, the most", async () => {
    const { url } = await served({ "/echo": { POST: echo } });
    const body = JSON.stringify("x".repeat(256 * 1024 - 2));
    expect(Buffer.byteLength(body)).toBe(256 * 1024);
    expect((await post(`${url}/echo`, body)).status).toBe(200);
  });

  it("refuses a body past 256 KiB as too_large, never handing it on", async () => {
    const handler = vi.fn(echo);
    const { url } = await served({ "/echo": { POST: handler } });
    const body = JSON.stringify("x".repeat(256 * 1024 - 1));
    expect(await refusal(await post(`${url}/echo`, body))).toEqual({ status: 413, body: { error: "too_large" } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("refuses a body past 256 KiB sent in chunks with no length, by its bytes", async () => {
    const handler = vi.fn(echo);
    const { url } = await served({ "/echo": { POST: handler } });
    const chunk = new TextEncoder().encode("x".repeat(64 * 1024));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let part = 0; part < 6; part += 1) controller.enqueue(chunk);
        controller.close();
      },
    });
    const response = await fetch(`${url}/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      duplex: "half",
    });
    expect(await refusal(response)).toEqual({ status: 413, body: { error: "too_large" } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("refuses a body as too_large once it passes 256 KiB, its stream never ended, never waiting for its end", async () => {
    const handler = vi.fn(echo);
    const { url } = await served({ "/echo": { POST: handler } });
    const { sent, status } = unended(`${url}/echo`, { headers: { "transfer-encoding": "chunked" } }, (request) => {
      request.write("x".repeat(300 * 1024));
    });
    expect(await status).toBe(413);
    sent.destroy();
    expect(handler).not.toHaveBeenCalled();
  });

  it("refuses a body that declares 10 GB as too_large at once, a few bytes sent", async () => {
    const handler = vi.fn(echo);
    const { url } = await served({ "/echo": { POST: handler } });
    const { sent, status, connection } = unended(
      `${url}/echo`,
      { headers: { "content-length": String(10 * 1024 ** 3) } },
      (request) => {
        request.write("{}");
      },
    );
    expect(await status).toBe(413);
    // The rest is never read: its connection closes once the refusal is written.
    expect(await connection).toBe("close");
    sent.destroy();
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls no handler for a body its client stopped sending and then left", async () => {
    const handler = vi.fn(echo);
    const { url, jarvis } = await served({ "/echo": { POST: handler } });
    const arrived = once(jarvis.server, "request");
    const { sent } = unended(`${url}/echo`, { headers: { "content-length": "100" } }, (request) => {
      request.write("x".repeat(10));
    });
    await arrived;
    sent.destroy();
    // events.once rejects on the error a destroyed request emits first.
    await new Promise((resolve) => sent.on("close", resolve));
    await jarvis.idle();
    expect(handler).not.toHaveBeenCalled();
  });

  it("sets the server's own timeouts: headers in 5 s, a request in 10 s, an idle connection 5 s", async () => {
    const { jarvis } = await served({ "/echo": { POST: echo } });
    const { server } = jarvis;
    expect([server.headersTimeout, server.requestTimeout, server.keepAliveTimeout]).toEqual([5_000, 10_000, 5_000]);
  });

  it("answers a handler that throws as internal, logging the error's name and never its message", async () => {
    const { url, events, raw } = await served({
      "/echo": { POST: () => Promise.reject(new TypeError("a-message-that-quotes-the-body")) },
    });
    expect(await refusal(await post(`${url}/echo`, "{}"))).toEqual({ status: 500, body: { error: "internal" } });
    expect(events()).toContainEqual({
      event: "jarvis_failed",
      route: "/echo",
      method: "POST",
      status: 500,
      error: "TypeError",
    });
    expect(raw()).not.toContain("a-message-that-quotes-the-body");
  });

  it("logs each refusal by its route and method, a path or method it does not know as one word", async () => {
    const { url, events, raw } = await served({ "/echo": { POST: echo } });
    await post(`${url}/a-path-the-client-wrote`, "{}");
    await fetch(`${url}/echo`, { method: "PUT" });
    await post(`${url}/echo`, "{", "application/json");
    expect(events()).toEqual([
      { event: "jarvis_refused", route: "<unknown>", method: "POST", status: 404, error: "not_found" },
      { event: "jarvis_refused", route: "/echo", method: "<other>", status: 405, error: "unsupported" },
      { event: "jarvis_refused", route: "/echo", method: "POST", status: 400, error: "refused" },
    ]);
    expect(raw()).not.toContain("a-path-the-client-wrote");
  });
});

describe("jarvis's HTTP face: a request that ends", () => {
  it("aborts its handler's signal once the client leaves before the answer", async () => {
    let seen: AbortSignal | undefined;
    const started = Promise.withResolvers<undefined>();
    const { url } = await served({
      "/slow": {
        POST: (_body, signal) => {
          seen = signal;
          started.resolve(undefined);
          return new Promise((resolve) => {
            signal.addEventListener("abort", () => {
              resolve({ status: 200, body: {} });
            });
          });
        },
      },
    });
    const leave = new AbortController();
    const answer = fetch(`${url}/slow`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: leave.signal,
    }).catch((error: unknown) => error);
    await started.promise;
    expect(seen?.aborted).toBe(false);
    leave.abort();
    await answer;
    await once(seen ?? new EventTarget(), "abort");
    expect(seen?.aborted).toBe(true);
  });

  it("logs nothing of a handler that fails once its client left: no fault of jarvis's", async () => {
    const started = Promise.withResolvers<undefined>();
    const { url, jarvis, events } = await served({
      "/slow": {
        POST: (_body, signal) => {
          started.resolve(undefined);
          return new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => {
              reject(new Error("the client left"));
            });
          });
        },
      },
    });
    const leave = new AbortController();
    const answer = fetch(`${url}/slow`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: leave.signal,
    }).catch((error: unknown) => error);
    await started.promise;
    leave.abort();
    await answer;
    await jarvis.idle();
    expect(events()).toEqual([]);
  });

  it("keeps its handler's signal unaborted once it answered", async () => {
    let seen: AbortSignal | undefined;
    const { url } = await served({
      "/echo": {
        POST: (body, signal) => {
          seen = signal;
          return echo(body, signal);
        },
      },
    });
    expect((await post(`${url}/echo`, "{}")).status).toBe(200);
    expect(seen?.aborted).toBe(false);
  });

  it("answers not_ready once it is no longer ready, closing the connection, its handler never called", async () => {
    const handler = vi.fn(echo);
    let ready = true;
    const { url } = await served({ "/echo": { POST: handler } }, () => ready);
    ready = false;
    const response = await post(`${url}/echo`, "{}");
    expect(await refusal(response)).toEqual({ status: 503, body: { error: "not_ready" } });
    expect(response.headers.get("connection")).toBe("close");
    expect(handler).not.toHaveBeenCalled();
  });

  it("says when the handlers in flight have all ended, at once when none is", async () => {
    let finish: () => void = () => undefined;
    const started = Promise.withResolvers<undefined>();
    const { url, jarvis } = await served({
      "/slow": {
        POST: () => {
          started.resolve(undefined);
          return new Promise((resolve) => {
            finish = () => {
              resolve({ status: 200, body: {} });
            };
          });
        },
      },
    });
    await jarvis.idle();
    const answer = post(`${url}/slow`, "{}");
    await started.promise;
    let idle = false;
    const waiting = jarvis.idle().then(() => {
      idle = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(idle).toBe(false);
    finish();
    await waiting;
    expect((await answer).status).toBe(200);
  });

  it("drops the answer of a request whose client already left, and stays up", async () => {
    const started = Promise.withResolvers<undefined>();
    const gate = Promise.withResolvers<undefined>();
    const { url, jarvis } = await served({
      "/slow": {
        POST: async () => {
          started.resolve(undefined);
          await gate.promise;
          return { status: 200, body: { late: true } };
        },
      },
      "/echo": { POST: echo },
    });
    const target = new URL(`${url}/slow`);
    const sent = httpRequest({
      host: target.hostname,
      port: target.port,
      path: target.pathname,
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    sent.on("error", () => undefined);
    sent.end("{}");
    await started.promise;
    sent.destroy();
    // events.once rejects on the error a destroyed request emits first.
    await new Promise((resolve) => sent.on("close", resolve));
    gate.resolve(undefined);
    await jarvis.idle();
    expect((await post(`${url}/echo`, "{}")).status).toBe(200);
  });
});
