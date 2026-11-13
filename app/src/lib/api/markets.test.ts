import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Fetcher } from "./http.ts";
import { MARKETS_MAX_BYTES, readMarkets } from "./markets.ts";

// Slice 5m: the browser's one read of markets.json, the file 5l's timer writes and nginx serves at /markets.json. The page
// shows what the file says or a state; it never shows a price the schema refused, and never a state that hides which one it is.
const GOOD = {
  source: "CoinGecko",
  updated: "2026-10-31T06:00:00.000Z",
  tokens: [
    { symbol: "GNOT", usd: 1.23, change24h: 2.5 },
    { symbol: "BTC", usd: 67000.5, change24h: null },
  ],
};
const answering = (body: unknown, init?: ResponseInit) =>
  vi.fn<Fetcher>(() => Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), init)));

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("readMarkets", () => {
  it("asks this site's /markets.json once, by GET, and never follows a redirect", async () => {
    const fetcher = answering(GOOD);
    await readMarkets(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("/markets.json");
    expect(init?.method ?? "GET").toBe("GET");
    expect(init?.redirect).toBe("error");
    expect(init?.credentials).toBe("same-origin");
  });

  it("refuses at once on a declared length past the cap, reading no body", async () => {
    const pulls = vi.fn();
    const body = new ReadableStream<Uint8Array>({ pull: pulls }, { highWaterMark: 0 });
    const big = vi.fn<Fetcher>(() =>
      Promise.resolve(new Response(body, { headers: { "content-length": String(MARKETS_MAX_BYTES + 1) } })),
    );
    expect(await readMarkets(big)).toEqual({ ok: false, reason: "malformed" });
    expect(pulls).not.toHaveBeenCalled();
  });

  it("frees the connection of an answer it does not read", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const down = vi.fn<Fetcher>(() => Promise.resolve(new Response(body, { status: 502 })));
    expect(await readMarkets(down)).toEqual({ ok: false, reason: "unavailable" });
    expect(cancelled).toBe(true);
  });

  it("says unavailable on any 2xx that is not a 200: the file is not what the timer writes", async () => {
    expect(await readMarkets(answering(JSON.stringify(GOOD), { status: 206 }))).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("gives the file's markets when it holds the schema's shape, tokens that have a price only", async () => {
    const result = await readMarkets(answering(GOOD));
    expect(result).toEqual({ ok: true, markets: GOOD });
  });

  it("gives a file with no token as a valid read: the source answered, nothing has a price", async () => {
    const result = await readMarkets(answering({ ...GOOD, tokens: [] }));
    expect(result).toEqual({ ok: true, markets: { ...GOOD, tokens: [] } });
  });

  it("says the file is missing on a 404, not that it is broken", async () => {
    expect(await readMarkets(answering("not found", { status: 404 }))).toEqual({ ok: false, reason: "missing" });
  });

  it("says the file is missing when the host answers its HTML fallback with a 404", async () => {
    const fallback = answering("<!doctype html><title>gno.world</title>", { status: 404 });
    expect(await readMarkets(fallback)).toEqual({ ok: false, reason: "missing" });
  });

  it("says unavailable on a server error", async () => {
    expect(await readMarkets(answering("", { status: 502 }))).toEqual({ ok: false, reason: "unavailable" });
  });

  it("says network when the request fails", async () => {
    const down = vi.fn<Fetcher>(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await readMarkets(down)).toEqual({ ok: false, reason: "network" });
  });

  it("says network, and leaves no timer, when the answer never comes", async () => {
    const never = vi.fn<Fetcher>(() => new Promise<Response>(() => undefined));
    const pending = readMarkets(never);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await pending).toEqual({ ok: false, reason: "network" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("says malformed on text that is no JSON, and on an answer the page's HTML fallback gave with a 200", async () => {
    expect(await readMarkets(answering("{"))).toEqual({ ok: false, reason: "malformed" });
    expect(await readMarkets(answering("<!doctype html><html></html>"))).toEqual({ ok: false, reason: "malformed" });
  });

  it.each([
    ["a source that is not CoinGecko", { ...GOOD, source: "Somebody" }],
    ["a time that is no time", { ...GOOD, updated: "yesterday" }],
    ["a token the row does not know", { ...GOOD, tokens: [{ symbol: "DOGE", usd: 1, change24h: null }] }],
    ["a price of zero", { ...GOOD, tokens: [{ symbol: "GNOT", usd: 0, change24h: null }] }],
    ["a negative price", { ...GOOD, tokens: [{ symbol: "GNOT", usd: -1, change24h: null }] }],
    ["a price as text", { ...GOOD, tokens: [{ symbol: "GNOT", usd: "1.23", change24h: null }] }],
    ["a field it does not know", { ...GOOD, extra: true }],
    ["a token twice", { ...GOOD, tokens: [GOOD.tokens[0], GOOD.tokens[0]] }],
    ["tokens out of the video's order", { ...GOOD, tokens: [GOOD.tokens[1], GOOD.tokens[0]] }],
    ["no tokens field", { source: GOOD.source, updated: GOOD.updated }],
  ])("says malformed, and keeps none of it, for %s", async (_what, body) => {
    expect(await readMarkets(answering(body))).toEqual({ ok: false, reason: "malformed" });
  });

  it.each([
    { what: "an empty answer", body: "", status: 200, reason: "malformed" },
    {
      what: "the demo's password asked for (401)",
      body: "<html>Unauthorized</html>",
      status: 401,
      reason: "unavailable",
    },
    { what: "a forbidden (403)", body: "", status: 403, reason: "unavailable" },
    { what: "too many requests (429)", body: "", status: 429, reason: "unavailable" },
  ] as const)("says $what is $reason, whatever the body holds", async ({ body, status, reason }) => {
    expect(await readMarkets(answering(body, { status }))).toEqual({ ok: false, reason });
  });

  it("says unavailable on no content (204): the file is not what the timer writes", async () => {
    const nothing = vi.fn<Fetcher>(() => Promise.resolve(new Response(null, { status: 204 })));
    expect(await readMarkets(nothing)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("says network, and leaves no timer, when the headers come and the body never ends", async () => {
    const stalled = new ReadableStream<Uint8Array>({ pull: () => new Promise<void>(() => undefined) });
    const pending = readMarkets(vi.fn<Fetcher>(() => Promise.resolve(new Response(stalled, { status: 200 }))));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await pending).toEqual({ ok: false, reason: "network" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("accepts a body of exactly the cap and refuses one byte more, padding included", async () => {
    const json = JSON.stringify(GOOD);
    const at = (bytes: number) => `${json}${" ".repeat(bytes - json.length)}`;
    expect(await readMarkets(answering(at(MARKETS_MAX_BYTES)))).toEqual({ ok: true, markets: GOOD });
    expect(await readMarkets(answering(at(MARKETS_MAX_BYTES + 1)))).toEqual({ ok: false, reason: "malformed" });
    expect(await readMarkets(answering(at(256 * 1024)))).toEqual({ ok: false, reason: "malformed" });
  });

  it("stops reading an endless body at the cap, and says malformed", async () => {
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(1024).fill(32));
      },
    });
    const result = await readMarkets(vi.fn<Fetcher>(() => Promise.resolve(new Response(endless, { status: 200 }))));
    expect(result).toEqual({ ok: false, reason: "malformed" });
    expect(pulled).toBeLessThan(MARKETS_MAX_BYTES / 1024 + 8);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ends the request, and leaves no timer, when its caller's signal aborts", async () => {
    const seen: (AbortSignal | null | undefined)[] = [];
    const never = vi.fn<Fetcher>((_url, init) => {
      seen.push(init?.signal);
      return new Promise<Response>(() => undefined);
    });
    const controller = new AbortController();
    const pending = readMarkets(never, { signal: controller.signal });
    controller.abort();
    expect(await pending).toEqual({ ok: false, reason: "network" });
    expect(seen[0]?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("asks nothing when its caller's signal is already aborted", async () => {
    const never = vi.fn<Fetcher>(() => new Promise<Response>(() => undefined));
    expect(await readMarkets(never, { signal: AbortSignal.abort() })).toEqual({ ok: false, reason: "network" });
    expect(never).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
