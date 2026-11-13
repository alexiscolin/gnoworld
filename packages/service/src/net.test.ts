import { execFile } from "node:child_process";
import { once } from "node:events";
import { createServer, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  Failure,
  fetchCapped,
  jsonOrFail,
  kindOf,
  publicUrl,
  readBytes,
  readCapped,
  readJson,
  reachedNothing,
  send,
  type Kind,
} from "./net.ts";
import { coded, fetchFailed } from "./testing/wayOut.ts";

const servers: Server[] = [];
const far = async (listener: RequestListener): Promise<string> => {
  const server = createServer(listener);
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${String(port)}/`;
};

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    server.close();
  }
});

describe("send", () => {
  it("passes the call through, method and body", async () => {
    const url = await far((req, res) => {
      req.pipe(res);
    });
    const response = await send(url, { method: "POST", body: "checked" }, 1000);
    expect(await response.text()).toBe("checked");
  });

  it("cuts a call the far end leaves hanging, at its timeout", async () => {
    const url = await far(() => undefined);
    const started = performance.now();
    await expect(send(url, {}, 100)).rejects.toMatchObject({ name: "TimeoutError" });
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("cuts a body that stalls once the headers came", async () => {
    const url = await far((_, res) => {
      res.writeHead(200).write("half");
    });
    const response = await send(url, {}, 200);
    await expect(response.text()).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("stops at once when its caller's own signal aborts, long before its timeout (10g)", async () => {
    const url = await far(() => undefined);
    const caller = new AbortController();
    const started = performance.now();
    const sent = send(url, { signal: caller.signal }, 10_000);
    setTimeout(() => {
      caller.abort();
    }, 50);
    await expect(sent).rejects.toMatchObject({ name: "AbortError" });
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("follows no redirect, which could lead anywhere", async () => {
    let reached = false;
    const elsewhere = await far((_, res) => {
      reached = true;
      res.end();
    });
    const url = await far((_, res) => {
      res.writeHead(302, { location: elsewhere }).end();
    });
    await expect(send(url, {}, 1000)).rejects.toSatisfy(
      (error: unknown) => error instanceof TypeError && String(error.cause).includes("redirect"),
    );
    expect(reached).toBe(false);
  });

  it("keeps its timeout and its refusal of redirects whatever the caller asks", async () => {
    let reached = false;
    const elsewhere = await far((_, res) => {
      reached = true;
      res.end();
    });
    const moved = await far((_, res) => {
      res.writeHead(302, { location: elsewhere }).end();
    });
    const hangs = await far(() => undefined);
    const never = new AbortController().signal;
    await expect(send(moved, { redirect: "follow" }, 1000)).rejects.toThrow(TypeError);
    expect(reached).toBe(false);
    await expect(send(hangs, { signal: never }, 100)).rejects.toMatchObject({ name: "TimeoutError" });
  });
});

// 10g: the capped read the prices timer, the names' read and the client of jarvis share.
describe("readCapped", () => {
  // A body that comes in the chunks given, and says when it is cut off.
  const chunked = (chunks: Uint8Array[]) => {
    const seen = { cancelled: false };
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const next = chunks.shift();
        if (next === undefined) controller.close();
        else controller.enqueue(next);
      },
      cancel() {
        seen.cancelled = true;
      },
    });
    return { response: new Response(body), seen };
  };
  const bytes = (count: number) => new Uint8Array(count).fill(0x61);

  it("reads a body of exactly its cap, across chunks", async () => {
    const { response } = chunked([bytes(3), bytes(4), bytes(3)]);
    expect(await readCapped(response, 10)).toBe("a".repeat(10));
  });

  it("refuses a body a byte past its cap, across chunks, and cuts it off unread", async () => {
    const { response, seen } = chunked([bytes(6), bytes(5), bytes(100)]);
    expect(await readCapped(response, 10)).toBeUndefined();
    expect(seen.cancelled).toBe(true);
  });

  it("reads an empty body, and a body that is none, as empty text", async () => {
    expect(await readCapped(chunked([]).response, 10)).toBe("");
    expect(await readCapped(new Response(null), 10)).toBe("");
  });

  it("reads a character split across chunks whole", async () => {
    const wide = Buffer.from(String.fromCodePoint(0x1f600));
    const { response } = chunked([wide.subarray(0, 2), wide.subarray(2)]);
    expect(await readCapped(response, 4)).toBe(String.fromCodePoint(0x1f600));
  });

  it("refuses a body that is no UTF-8 by a shape Failure, never as text whose bytes it replaced", async () => {
    const { response } = chunked([Uint8Array.from([0x7b, 0x22, 0xff, 0x22, 0x7d])]);
    await expect(readCapped(response, 10)).rejects.toThrow(expect.objectContaining({ kind: "shape" }));
  });

  it("lets a read that fails rise, as a cut stream does", async () => {
    const body = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error("cut");
      },
    });
    await expect(readCapped(new Response(body), 10)).rejects.toThrow("cut");
  });
});

describe("readJson", () => {
  it("reads none of an answer whose status is no success, and cuts its body off unread (F5273)", async () => {
    const seen = { cancelled: false };
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode('{"error":"internal"}'));
      },
      cancel() {
        seen.cancelled = true;
      },
    });
    expect(await readJson(new Response(body, { status: 500 }), 100)).toBeUndefined();
    expect(seen.cancelled).toBe(true);
    expect(await readJson(new Response('{"error":"internal"}', { status: 500 }), 100)).toBeUndefined();
    expect(await readJson(new Response(null, { status: 503 }), 100)).toBeUndefined();
  });

  it("reads a body's JSON up to its cap, and none past it or for text that is no JSON", async () => {
    expect(await readJson(new Response('{"a":[1]}'), 9)).toEqual({ a: [1] });
    expect(await readJson(new Response('{"a":[1]}'), 8)).toBeUndefined();
    expect(await readJson(new Response("<html>"), 100)).toBeUndefined();
    expect(await readJson(new Response(""), 100)).toBeUndefined();
  });

  it("reads none of a body that is no UTF-8, though its bytes replaced would be JSON", async () => {
    expect(await readJson(new Response(Uint8Array.from([0x22, 0xff, 0x22])), 100)).toBeUndefined();
  });

  it("reads no JSON from a success that has no body at all, a 204, and does not throw", async () => {
    expect(await readJson(new Response(null, { status: 204 }), 100)).toBeUndefined();
    expect(await readJson(new Response(null, { status: 200 }), 100)).toBeUndefined();
  });
});

const fault = (name: string): Error => Object.assign(new Error("secret-of-the-answer"), { name });
const breaking = (name: string): Response =>
  new Response(
    new ReadableStream({
      pull() {
        throw fault(name);
      },
    }),
  );
const textOf = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

describe("kindOf", () => {
  it("gives a Failure its own kind, a call out of time a timeout, and anything else a request", () => {
    expect(kindOf(new Failure("too_large"))).toBe("too_large");
    expect(kindOf(fault("TimeoutError"))).toBe("timeout");
    expect(kindOf(fault("AbortError"))).toBe("timeout");
    expect(kindOf(new TypeError("fetch failed"))).toBe("request");
    expect(kindOf("a thrown text")).toBe("request");
  });
});

describe("kindOf, a call that reached nothing, by its cause's code alone (F4872)", () => {
  it.each([
    ["no address for the way out's name, before it starts", [coded("ENOTFOUND")], "unresolved"],
    ["no answer from the resolver", [coded("EAI_AGAIN")], "unresolved"],
    ["nothing listening where the way out will be", [coded("ECONNREFUSED")], "refused"],
    ["the way out refusing the tunnel, two causes down", [coded(0), coded("UND_ERR_ABORTED", "AbortError")], "proxy"],
    ["a code it has no name for", [coded("ECONNRESET")], "request"],
    ["a code that is no text", [coded({ toString: () => "ENOTFOUND" })], "request"],
    ["a code named like an object's own key", [coded("constructor")], "request"],
    [
      "a message that names a code beside another code",
      [Object.assign(new Error("getaddrinfo ENOTFOUND guard"), { code: "ECONNRESET" })],
      "request",
    ],
    ["a message that names a code, with no code", [new Error("connect ECONNREFUSED 10.1.2.3:4750")], "request"],
    ["a code three causes down", [coded(0), coded(0), coded("ENOTFOUND")], "unresolved"],
    ["a code four causes down, past the causes read", [coded(0), coded(0), coded(0), coded("ENOTFOUND")], "request"],
  ])("names %s", (_name, causes, kind) => {
    expect(kindOf(fetchFailed(...causes))).toBe(kind);
  });

  it("ends on a cause that holds itself", () => {
    const loop = coded("ECONNRESET");
    loop.cause = loop;
    expect(kindOf(fetchFailed(loop))).toBe("request");
  });

  it("names a call to a port where nothing listens, through fetch itself", async () => {
    const error: unknown = await send(`${await closedAddress()}/`, {}, 2000).catch((thrown: unknown) => thrown);
    expect(kindOf(error)).toBe("refused");
  });
});

// An address on this machine where nothing listens: a port taken, then let go.
async function closedAddress(): Promise<string> {
  const server = createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  server.close();
  await once(server, "close");
  return `http://127.0.0.1:${String(port)}`;
}

describe("kindOf, through Node's own proxy as the stack sets it (HTTPS_PROXY, NODE_USE_ENV_PROXY)", () => {
  const run = promisify(execFile);
  const net = new URL("net.ts", import.meta.url).href;
  // A Node of its own, as the server's image starts it, asks an https host through `proxy` and prints the kind of its fault.
  const kindThrough = async (proxy: string): Promise<string> => {
    const code = `import { kindOf, send } from ${JSON.stringify(net)};
send("https://far.test/", {}, 5000).then(() => console.log("answered"), (error) => console.log(kindOf(error)));`;
    const env = { PATH: process.env["PATH"] ?? "", HTTPS_PROXY: proxy, NODE_USE_ENV_PROXY: "1" };
    const { stdout } = await run(process.execPath, ["--input-type=module", "-e", code], { env, timeout: 15_000 });
    return stdout.trim();
  };
  // A way out that refuses every tunnel, as smokescreen refuses a host its list does not name (407).
  const refusing = async (): Promise<string> => {
    const server = createServer().listen(0, "127.0.0.1");
    servers.push(server);
    server.on("connect", (_request, socket) => {
      socket.end("HTTP/1.1 407 Refused\r\nContent-Length: 0\r\n\r\n");
    });
    await once(server, "listening");
    return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  };

  // A Node started cold under the gate's load takes its time: each row gives its child all of its 15 s.
  it.each([
    ["with no address yet", () => Promise.resolve("http://guard.invalid:4750"), "unresolved"],
    ["where nothing listens", closedAddress, "refused"],
    ["that refuses the host", refusing, "proxy"],
  ])("names a way out %s", { timeout: 20_000 }, async (_name, proxy, kind) => {
    expect(await kindThrough(await proxy())).toBe(kind);
  });
});

describe("reachedNothing", () => {
  it("is a name with no address or nothing listening, never a fault that may have reached the host, and no other kind", () => {
    // Every kind, so a new one is a choice made here.
    const nothing: Record<Kind, boolean> = {
      unresolved: true,
      refused: true,
      request: false,
      proxy: false,
      timeout: false,
      status: false,
      rate_limited: false,
      too_large: false,
      too_many: false,
      not_json: false,
      shape: false,
      no_price: false,
      chain_refused: false,
      path: false,
      empty: false,
      write: false,
      stopped: false,
      other_chain: false,
    };
    for (const [kind, reached] of Object.entries(nothing) as [Kind, boolean][])
      expect(reachedNothing(kind)).toBe(reached);
  });
});

describe("readBytes", () => {
  it("gives the body's bytes up to the cap exactly", async () => {
    expect(textOf(await readBytes(new Response("abc"), 3))).toBe("abc");
  });

  it("gives no bytes for a response with no body", async () => {
    expect(await readBytes(new Response(null), 3)).toEqual(new Uint8Array());
  });

  it("refuses a body past the cap as too_large", async () => {
    await expect(readBytes(new Response("abcd"), 3)).rejects.toMatchObject({ kind: "too_large" });
  });

  it("names a body that breaks by its kind, never by what it said", async () => {
    await expect(readBytes(breaking("TimeoutError"), 3)).rejects.toMatchObject({
      kind: "timeout",
      message: "timeout",
    });
    await expect(readBytes(breaking("TypeError"), 3)).rejects.toMatchObject({ kind: "request", message: "request" });
  });
});

describe("fetchCapped", () => {
  const limits = { ms: 7, maxBytes: 3 };
  const request = { url: "https://far.test/a", init: { method: "GET" } };

  it("asks through the way out it is given, with its time, and gives the bytes", async () => {
    const asked: unknown[] = [];
    const through = (...call: unknown[]): Promise<Response> => {
      asked.push(call);
      return Promise.resolve(new Response("abc"));
    };
    expect(textOf(await fetchCapped(through, request, limits))).toBe("abc");
    expect(asked).toEqual([[request.url, request.init, limits.ms]]);
  });

  it("names a refusal: 429 is rate_limited, any other status is status", async () => {
    const answering = (status: number) => () => Promise.resolve(new Response("no", { status }));
    await expect(fetchCapped(answering(429), request, limits)).rejects.toMatchObject({ kind: "rate_limited" });
    await expect(fetchCapped(answering(500), request, limits)).rejects.toMatchObject({ kind: "status" });
  });

  it("names a call that fails, and caps the body", async () => {
    const failing = (name: string) => () => Promise.reject(fault(name));
    await expect(fetchCapped(failing("TimeoutError"), request, limits)).rejects.toMatchObject({ kind: "timeout" });
    await expect(fetchCapped(failing("TypeError"), request, limits)).rejects.toMatchObject({ kind: "request" });
    const long = () => Promise.resolve(new Response("abcd"));
    await expect(fetchCapped(long, request, limits)).rejects.toMatchObject({ kind: "too_large" });
  });
});

describe("jsonOrFail", () => {
  it("gives what the text holds", () => {
    expect(jsonOrFail('{"a":1}')).toEqual({ a: 1 });
  });

  it("refuses a text that is no JSON as not_json, with none of the text", () => {
    expect(() => jsonOrFail("<secret>")).toThrow(new Failure("not_json"));
  });
});

describe("publicUrl", () => {
  it("gives the address of a public https name", () => {
    expect(publicUrl("https://rpc.onyx.testnets.gno.land:443")?.hostname).toBe("rpc.onyx.testnets.gno.land");
    expect(publicUrl("https://indexer.gno.land/graphql/query")?.pathname).toBe("/graphql/query");
  });

  it("refuses what is no address, no https, or a name of this machine or network", () => {
    for (const address of [
      "not an address",
      "http://rpc.gno.land",
      "https://127.0.0.1",
      "https://localhost",
      "https://169.254.169.254",
      "https://rpc.internal",
    ])
      expect(publicUrl(address)).toBeNull();
  });

  it("refuses an address that carries a user or a password", () => {
    expect(publicUrl("https://me@rpc.gno.land")).toBeNull();
    expect(publicUrl("https://:secret@rpc.gno.land")).toBeNull();
  });
});
