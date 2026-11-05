import { execFile } from "node:child_process";
import { once } from "node:events";
import { createServer, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { Failure, fetchCapped, jsonOf, kindOf, publicUrl, reachedNothing, readCapped, send, type Kind } from "./net.ts";
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

  it("names a way out with no address yet, one where nothing listens, and one that refuses the host", async () => {
    expect(await kindThrough("http://guard.invalid:4750")).toBe("unresolved");
    expect(await kindThrough(await closedAddress())).toBe("refused");
    expect(await kindThrough(await refusing())).toBe("proxy");
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
    };
    for (const [kind, reached] of Object.entries(nothing) as [Kind, boolean][])
      expect(reachedNothing(kind)).toBe(reached);
  });
});

describe("readCapped", () => {
  it("gives the body's bytes up to the cap exactly", async () => {
    expect(textOf(await readCapped(new Response("abc"), 3))).toBe("abc");
  });

  it("gives no bytes for a response with no body", async () => {
    expect(await readCapped(new Response(null), 3)).toEqual(new Uint8Array());
  });

  it("refuses a body past the cap as too_large", async () => {
    await expect(readCapped(new Response("abcd"), 3)).rejects.toMatchObject({ kind: "too_large" });
  });

  it("names a body that breaks by its kind, never by what it said", async () => {
    await expect(readCapped(breaking("TimeoutError"), 3)).rejects.toMatchObject({
      kind: "timeout",
      message: "timeout",
    });
    await expect(readCapped(breaking("TypeError"), 3)).rejects.toMatchObject({ kind: "request", message: "request" });
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

describe("jsonOf", () => {
  it("gives what the text holds", () => {
    expect(jsonOf('{"a":1}')).toEqual({ a: 1 });
  });

  it("refuses a text that is no JSON as not_json, with none of the text", () => {
    expect(() => jsonOf("<secret>")).toThrow(new Failure("not_json"));
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
