import { describe, expect, it } from "vitest";
import { abciQuery, Failure, isDown, kindOf, pacer, type Send } from "./remote.ts";

// The shared parts of the worlds job's reads; the reads themselves are tested through each reader.
describe("kindOf", () => {
  it("gives a Failure its own kind, a call out of time a timeout, and anything else a request that reached nothing", () => {
    expect(kindOf(new Failure("too_large"))).toBe("too_large");
    expect(kindOf(Object.assign(new Error("t"), { name: "TimeoutError" }))).toBe("timeout");
    expect(kindOf(Object.assign(new Error("a"), { name: "AbortError" }))).toBe("timeout");
    expect(kindOf(new TypeError("fetch failed"))).toBe("request");
    expect(kindOf("secret-token-123")).toBe("request");
  });
});

describe("pacer", () => {
  it("waits before every call but the first, by the pause it was given", async () => {
    const waits: number[] = [];
    const pace = pacer(
      (ms) => Promise.resolve(void waits.push(ms)),
      250,
      () => 0,
    );
    await pace();
    expect(waits).toEqual([]);
    await pace();
    await pace();
    expect(waits).toEqual([250, 250]);
  });

  // 7k3: a pause after each answer made a first pass of onyx-1 13.2 minutes, 1,628 calls at about 233 ms each plus 250 of pause. Here the
  // wait moves the clock, as time does, and each call takes the time given: the calls start a pause apart, or later after a slow one.
  it("starts the calls a pause apart on its clock: it waits what is left of the pause, and nothing after a call slower than it", async () => {
    const waits: number[] = [];
    const starts: number[] = [];
    const clock = { at: 0 };
    const pace = pacer(
      (ms) => {
        waits.push(ms);
        clock.at += ms;
        return Promise.resolve();
      },
      250,
      () => clock.at,
    );
    for (const took of [100, 100, 300, 250, 0]) {
      await pace();
      starts.push(clock.at);
      clock.at += took;
    }
    await pace();
    starts.push(clock.at);
    expect(starts).toEqual([0, 250, 500, 800, 1050, 1300]);
    expect(waits).toEqual([150, 150, 250]);
  });

  it("waits no more than the pause when its clock steps back", async () => {
    const waits: number[] = [];
    const clock = { at: 3_600_000 };
    const pace = pacer(
      (ms) => Promise.resolve(void waits.push(ms)),
      250,
      () => clock.at,
    );
    await pace();
    clock.at = 0;
    await pace();
    expect(waits).toEqual([250]);
  });
});

// The envelope of an abci_query, with hostile bodies: every fault has its own kind, and none lets text out.
const RPC_URL = "https://rpc.example.org";
const envelope = (Data: unknown, extra: Record<string, unknown> = {}): Response =>
  Response.json({ result: { response: { ResponseBase: { Error: null, Data } } }, ...extra });
const asks = (given: Response | Error, maxBytes = 1024) => {
  const seen: { url: string; init: RequestInit }[] = [];
  const send: Send = (url, init) => {
    seen.push({ url, init });
    return given instanceof Error ? Promise.reject(given) : Promise.resolve(given);
  };
  return { seen, done: abciQuery({ send, rpc: RPC_URL }, { path: "vm/qdoc", data: "x" }, { ms: 1000, maxBytes }) };
};
const b64 = (text: string | Uint8Array): string => Buffer.from(text).toString("base64");

describe("abciQuery", () => {
  it("gives the decoded text of a good answer, asking with a GET and a JSON accept header", async () => {
    const { seen, done } = asks(envelope(b64("hello")));
    expect(await done).toBe("hello");
    expect(seen[0]?.init.method).toBe("GET");
    expect(new Headers(seen[0]?.init.headers).get("accept")).toBe("application/json");
    expect(seen[0]?.url.startsWith(`${RPC_URL}/abci_query?`)).toBe(true);
  });

  it.each([
    ["a body that is no UTF-8", new Response(new Uint8Array([0xff, 0xfe, 0xfd])), "shape"],
    ["a body that is no JSON", new Response("<html>bad gateway</html>"), "shape"],
    ["a body that is a JSON string", Response.json("text"), "shape"],
    ["a Data that is UTF-8 invalid once decoded", envelope(b64(new Uint8Array([0xff, 0xfe]))), "shape"],
    ["a Data whose length is no multiple of 4", envelope("abc"), "shape"],
    ["a Data with a character outside base64", envelope("ab!="), "shape"],
    ["a Data with a bad character before good ones", envelope("!!AAAAAA"), "shape"],
    ["a Data with a bad character after good ones", envelope("AAAAAA!!"), "shape"],
    ["a Data with three padding characters", envelope("A==="), "shape"],
    ["a Data of the wrong type", envelope(12), "shape"],
    ["no result", Response.json({}), "shape"],
    ["a JSON-RPC error", Response.json({ error: { code: -32600, message: "bad" } }), "chain_refused"],
    ["an error beside a result", envelope(b64("late"), { error: {} }), "chain_refused"],
    [
      "a refusal in the response",
      Response.json({ result: { response: { ResponseBase: { Error: { "@type": "/std.Oops" }, Data: null } } } }),
      "chain_refused",
    ],
    ["a text past the cap", envelope(b64("x".repeat(2000))), "too_large"],
  ])("gives %s the kind %s", async (_name, given, kind) => {
    await expect(asks(given).done).rejects.toMatchObject({ kind });
  });

  it("takes a text of exactly the cap and refuses one byte over", async () => {
    expect(await asks(envelope(b64("x".repeat(100))), 100).done).toHaveLength(100);
    await expect(asks(envelope(b64("x".repeat(101))), 100).done).rejects.toMatchObject({ kind: "too_large" });
  });

  it("takes a Data of one, two or no padding character", async () => {
    expect(await asks(envelope(b64("a"))).done).toBe("a");
    expect(await asks(envelope(b64("ab"))).done).toBe("ab");
    expect(await asks(envelope(b64("abc"))).done).toBe("abc");
    expect(await asks(envelope(null)).done).toBe("");
  });
});

describe("isDown", () => {
  it.each(["request", "timeout", "status", "rate_limited"] as const)(
    "says %s is the network or the chain not answering",
    (kind) => {
      expect(isDown(kind)).toBe(true);
    },
  );
  it.each([
    "too_large",
    "too_many",
    "not_json",
    "shape",
    "chain_refused",
    "path",
    "empty",
    "write",
    "stopped",
  ] as const)("says %s is about one read", (kind) => {
    expect(isDown(kind)).toBe(false);
  });
});
