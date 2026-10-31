import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as z from "zod/mini";
import { readChain, type ChainFetch, type ChainRead, type Failure } from "./read.ts";

// 5g, the failure paths of what the browser reads from the chain (the plan's §3 row on the RPC's answers). A small schema stands
// in: these paths do not depend on what an answer holds. The answers' own shapes (qrender, qeval, qfuncs, the block height)
// wait for fixtures recorded through gnomcp.
const URL_OK = "https://rpc.example.org/status";
const NOW = new Date("2026-10-31T06:00:00.000Z");
const Answer = z.strictObject({ height: z.string(), note: z.optional(z.string()) });
const GOOD = JSON.stringify({ height: "42" });

const respond = (body: BodyInit | null, init?: ResponseInit): ChainFetch =>
  vi.fn(() => Promise.resolve(new Response(body, init)));
const read = (fetcher: ChainFetch, options: { timeoutMs?: number; maxBytes?: number } = {}) =>
  readChain(URL_OK, Answer, { fetch: fetcher, now: () => NOW, ...options });

// A body of exactly `bytes` bytes that is JSON: a string padded with "a".
const jsonOf = (bytes: number): string => {
  const fixed = JSON.stringify({ height: "", note: "" }).length;
  return JSON.stringify({ height: "", note: "a".repeat(bytes - fixed) });
};

// The failure of a result, which must be one; its next step is a sentence of ours.
const failureOf = (result: ChainRead<unknown>): Failure => {
  if (result.ok) throw new Error("expected a failure");
  expect(result.failure.next).toMatch(/\S/);
  return result.failure;
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("readChain, an answer that is sound", () => {
  it("gives the value with its source: where it was read and when", async () => {
    const result = await read(respond(GOOD));
    expect(result).toEqual({ ok: true, value: { height: "42" }, source: { url: URL_OK, at: NOW.toISOString() } });
  });

  it("asks once, with no cookie, no redirect followed and a signal", async () => {
    const fetcher = respond(GOOD);
    await read(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetcher).mock.calls[0] ?? [];
    expect(url).toBe(URL_OK);
    expect(init).toMatchObject({ credentials: "omit", redirect: "error" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("leaves no timer behind: nothing polls", async () => {
    await read(respond(GOOD));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("asks again only when called again: each call is one request, a failure is not retried", async () => {
    const fetcher = respond("down", { status: 503 });
    await read(fetcher);
    await vi.advanceTimersByTimeAsync(10 * 8000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await read(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("readChain, the service down", () => {
  it.each([
    ["fetch rejecting with an error", () => Promise.reject(new TypeError("Failed to fetch"))],
    [
      "fetch throwing at once",
      () => {
        throw new Error("blocked");
      },
    ],
  ])("is a typed state with its next step on %s", async (_name, impl) => {
    const result = await read(vi.fn(impl));
    expect(failureOf(result).kind).toBe("down");
  });

  it.each([500, 502, 503, 429, 404, 403])("is down on HTTP %i, keeping the status", async (status) => {
    const result = await read(respond(GOOD, { status }));
    expect(failureOf(result).kind).toBe("down");
    expect(result.ok ? 0 : result.failure.status).toBe(status);
  });

  it("is down when the body breaks off", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"height":'));
        controller.error(new TypeError("network error"));
      },
    });
    expect(failureOf(await read(respond(body))).kind).toBe("down");
  });

  it("is a number never without its source: a failure names where and when too", async () => {
    const result = await read(respond("", { status: 500 }));
    expect(result.source).toEqual({ url: URL_OK, at: NOW.toISOString() });
  });
});

describe("readChain, the time", () => {
  // A fetch that honours its signal, as a real one does.
  const slow: ChainFetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  // A fetch that never settles and ignores its signal: the time limit must not depend on it.
  const deaf: ChainFetch = () => new Promise(() => undefined);

  it.each([
    ["honours its signal", slow],
    ["ignores its signal", deaf],
  ])("gives a timeout when fetch %s, at the time and not before", async (_name, fetcher) => {
    let settled = false;
    const pending = read(fetcher, { timeoutMs: 5000 }).then((result) => {
      settled = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(4999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;
    expect(result).toMatchObject({ ok: false, failure: { kind: "timeout" } });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("covers the body too: a body that stalls after the headers times out", async () => {
    const stalled = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"height":'));
      },
    });
    const pending = read(respond(stalled), { timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toMatchObject({ ok: false, failure: { kind: "timeout" } });
  });

  it("does not time out an answer that came in time", async () => {
    const pending = read(respond(GOOD), { timeoutMs: 1000 });
    expect(await pending).toMatchObject({ ok: true });
    await vi.advanceTimersByTimeAsync(5000);
  });
});

describe("readChain, a huge answer", () => {
  it("reads a body of exactly the cap", async () => {
    const body = jsonOf(1000);
    expect(new TextEncoder().encode(body).byteLength).toBe(1000);
    expect(await read(respond(body), { maxBytes: 1000 })).toMatchObject({ ok: true });
  });

  it("refuses a body one byte past the cap", async () => {
    const body = jsonOf(1001);
    expect(new TextEncoder().encode(body).byteLength).toBe(1001);
    expect(await read(respond(body), { maxBytes: 1000 })).toMatchObject({ ok: false, failure: { kind: "too-big" } });
  });

  it("counts bytes, not characters", async () => {
    // 600 two-byte characters in a JSON string: 600 characters, past 1,000 bytes.
    const body = JSON.stringify({ height: "1", note: "é".repeat(600) });
    expect(body.length).toBeLessThan(1000);
    expect(await read(respond(body), { maxBytes: 1000 })).toMatchObject({ ok: false, failure: { kind: "too-big" } });
  });

  it("refuses at once on a Content-Length past the cap, reading no body", async () => {
    const pulls = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls();
        controller.enqueue(new Uint8Array(10));
      },
    });
    const result = await read(respond(body, { headers: { "content-length": "1001" } }), { maxBytes: 1000 });
    expect(result).toMatchObject({ ok: false, failure: { kind: "too-big" } });
    expect(pulls.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("stops reading a body that never ends, a chunk past the cap at most", async () => {
    let sent = 0;
    const chunk = 64;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += chunk;
        controller.enqueue(new Uint8Array(chunk).fill(97));
      },
    });
    const result = await read(respond(endless), { maxBytes: 1000 });
    expect(result).toMatchObject({ ok: false, failure: { kind: "too-big" } });
    // The stream's own queue may hold a few chunks ahead of the reader; it is bounded, not endless.
    expect(sent).toBeLessThanOrEqual(1000 + chunk * 4);
  });

  it("does not trust a Content-Length that is smaller than the body", async () => {
    const result = await read(respond(jsonOf(1500), { headers: { "content-length": "10" } }), { maxBytes: 1000 });
    expect(result).toMatchObject({ ok: false, failure: { kind: "too-big" } });
  });
});

describe("readChain, an answer that is no JSON or the wrong shape", () => {
  it.each([
    ["HTML", "<!doctype html><title>502</title>"],
    ["an empty body", ""],
    ["a cut JSON", '{"height":"4'],
    ["text", "ok"],
    ["bytes that are no UTF-8", new Uint8Array([0xff, 0xfe, 0x7b, 0x7d])],
    // Valid JSON apart from one byte: a decoder that is not strict would hand the page a U+FFFD inside an ok value.
    [
      "an invalid byte inside an otherwise valid JSON string",
      new Uint8Array([...new TextEncoder().encode('{"height":"'), 0xff, 0x22, 0x7d]),
    ],
  ])("is not-json on %s", async (_name, body) => {
    const result = await read(respond(body));
    expect(failureOf(result).kind).toBe("not-json");
  });

  it.each([
    ["a number for a string", '{"height":42}'],
    ["a missing field", "{}"],
    ["null", "null"],
    ["an array", "[]"],
    ["a string", '"42"'],
    ["an extra field", '{"height":"1","extra":true}'],
    ["a nested object", '{"height":{"value":"1"}}'],
  ])("is wrong-shape on %s", async (_name, body) => {
    const result = await read(respond(body));
    expect(failureOf(result).kind).toBe("wrong-shape");
  });
});

describe("readChain, a hostile string", () => {
  const HOSTILE = [
    "<script>alert(1)</script>",
    "javascript:alert(1)",
    "</script><!--  ",
    "\u0000‮",
    "'; DROP TABLE x; --",
    "${process.env.SECRET}",
  ];

  it.each(HOSTILE)("comes back as the same inert string in a good answer: %j", async (hostile) => {
    const result = await read(respond(JSON.stringify({ height: "1", note: hostile })));
    expect(result.ok && result.value.note).toBe(hostile);
  });

  it.each(HOSTILE)("is never echoed by a failure's next step: %j", async (hostile) => {
    for (const body of [JSON.stringify({ height: hostile, extra: hostile }), hostile, JSON.stringify([hostile])]) {
      const result = await read(respond(body));
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result.ok ? {} : result.failure)).not.toContain(hostile);
    }
  });

  it("pollutes no prototype with a __proto__ key", async () => {
    const result = await read(respond('{"height":"1","__proto__":{"polluted":true}}'));
    expect(result.ok).toBe(false);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    const loose = await readChain(URL_OK, z.looseObject({ height: z.string() }), {
      fetch: respond('{"height":"1","__proto__":{"polluted":true}}'),
      now: () => NOW,
    });
    expect(loose.ok).toBe(true);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });
});

describe("readChain, an address that is not https", () => {
  it.each([
    "http://rpc.example.org/status",
    "ws://rpc.example.org/websocket",
    "//rpc.example.org/status",
    "/status",
    "rpc.example.org",
    "",
    "https://user:pass@rpc.example.org/status",
    "javascript:alert(1)",
    "data:application/json,{}",
  ])("refuses %j, asking nothing", async (url) => {
    const fetcher = respond(GOOD);
    const result = await readChain(url, Answer, { fetch: fetcher, now: () => NOW });
    expect(failureOf(result).kind).toBe("refused");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("readChain, a body that comes in pieces or not at all", () => {
  const enc = new TextEncoder();
  const piecesOf = (...parts: Uint8Array[]): ReadableStream<Uint8Array> =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const part of parts) controller.enqueue(part);
        controller.close();
      },
    });

  it("joins a good answer split in two chunks, a multi-byte character across the split", async () => {
    const bytes = enc.encode('{"height":"é"}');
    const cut = bytes.indexOf(0xc3) + 1;
    expect(cut).toBeGreaterThan(0);
    const result = await read(respond(piecesOf(bytes.slice(0, cut), bytes.slice(cut))));
    expect(result).toMatchObject({ ok: true, value: { height: "é" } });
  });

  it("is not-json on a 200 with no body at all", async () => {
    expect(failureOf(await read(respond(null))).kind).toBe("not-json");
  });

  it("reads a body of exactly the cap that declares its Content-Length", async () => {
    const body = jsonOf(1000);
    const result = await read(respond(body, { headers: { "content-length": "1000" } }), { maxBytes: 1000 });
    expect(result).toMatchObject({ ok: true });
  });
});

describe("readChain, a refused answer frees its connection", () => {
  // A source that records its cancel; `fails` makes the cancel itself reject, which must change nothing for the caller.
  const watched = (fails: boolean, chunks = 0) => {
    const cancel = vi.fn(() => (fails ? Promise.reject(new Error("cancel failed")) : undefined));
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(64).fill(97));
      },
      cancel,
    });
    return { cancel, stream, chunks };
  };
  const paths: [string, (stream: ReadableStream<Uint8Array>) => ChainFetch, string][] = [
    ["a non-ok status", (stream) => respond(stream, { status: 503 }), "down"],
    ["a declared size past the cap", (stream) => respond(stream, { headers: { "content-length": "1001" } }), "too-big"],
    ["a counted size past the cap", (stream) => respond(stream), "too-big"],
  ];

  it.each(paths)("cancels the stream once on %s", async (_name, make, kind) => {
    const { cancel, stream } = watched(false);
    const result = await read(make(stream), { maxBytes: 1000 });
    expect(failureOf(result).kind).toBe(kind);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it.each(paths)("gives the same typed failure when the cancel rejects, on %s", async (_name, make, kind) => {
    const { cancel, stream } = watched(true);
    const result = await read(make(stream), { maxBytes: 1000 });
    expect(failureOf(result).kind).toBe(kind);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe("readChain, each failure's next step", () => {
  const NEXT = {
    refused: "This address is not a secure (https) one, so it was not asked. Check the universe's RPC in the data.",
    down: "The chain's service did not answer. Try again in a moment.",
    timeout: "The chain's service took too long. Try again in a moment.",
    tooBig: "The chain's answer was larger than this page reads. Try a smaller view.",
    notJson: "The chain's service answered with something that is not data. Try again later.",
    wrongShape: "The chain's answer was not the shape this page expects. Try again later, or report it.",
  };
  const cases: [string, () => Promise<ChainRead<unknown>>, Failure][] = [
    [
      "refused",
      () => readChain("http://rpc.example.org/", Answer, { now: () => NOW }),
      { kind: "refused", next: NEXT.refused },
    ],
    ["down, no answer", () => read(vi.fn(() => Promise.reject(new TypeError("x")))), { kind: "down", next: NEXT.down }],
    ["down, HTTP 503", () => read(respond("", { status: 503 })), { kind: "down", next: NEXT.down, status: 503 }],
    [
      "timeout",
      async () => {
        const pending = read(() => new Promise(() => undefined), { timeoutMs: 100 });
        await vi.advanceTimersByTimeAsync(100);
        return pending;
      },
      { kind: "timeout", next: NEXT.timeout },
    ],
    ["too-big", () => read(respond(jsonOf(1001)), { maxBytes: 1000 }), { kind: "too-big", next: NEXT.tooBig }],
    ["not-json", () => read(respond("ok")), { kind: "not-json", next: NEXT.notJson }],
    ["wrong-shape", () => read(respond("{}")), { kind: "wrong-shape", next: NEXT.wrongShape }],
  ];

  it.each(cases)("is exact on %s", async (_name, run, expected) => {
    const result = await run();
    expect(result.ok ? null : result.failure).toEqual(expected);
  });
});

describe("readChain, the defaults production uses", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks the global fetch and stamps the source with the clock", async () => {
    vi.setSystemTime(NOW);
    const global = vi.fn(() => Promise.resolve(new Response(GOOD)));
    vi.stubGlobal("fetch", global);
    const result = await readChain(URL_OK, Answer);
    expect(global).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, value: { height: "42" }, source: { url: URL_OK, at: NOW.toISOString() } });
  });

  it("times out a deaf fetch at exactly 8,000 ms", async () => {
    vi.stubGlobal("fetch", () => new Promise(() => undefined));
    let settled = false;
    const pending = readChain(URL_OK, Answer).then((result) => {
      settled = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(7999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ ok: false, failure: { kind: "timeout" } });
  });

  it("reads 1,048,576 bytes and refuses 1,048,577", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(jsonOf(1_048_576))));
    expect(await readChain(URL_OK, Answer)).toMatchObject({ ok: true });
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(jsonOf(1_048_577))));
    expect(await readChain(URL_OK, Answer)).toMatchObject({ ok: false, failure: { kind: "too-big" } });
  });
});
