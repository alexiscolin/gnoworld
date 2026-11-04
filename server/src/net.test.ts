import { once } from "node:events";
import { createServer, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { readCapped, readJson, send } from "./net.ts";

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
});

describe("readJson", () => {
  it("reads a body's JSON up to its cap, and none past it or for text that is no JSON", async () => {
    expect(await readJson(new Response('{"a":[1]}'), 9)).toEqual({ a: [1] });
    expect(await readJson(new Response('{"a":[1]}'), 8)).toBeUndefined();
    expect(await readJson(new Response("<html>"), 100)).toBeUndefined();
    expect(await readJson(new Response(""), 100)).toBeUndefined();
  });
});
