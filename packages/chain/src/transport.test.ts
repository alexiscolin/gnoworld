import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBytes, type ChainFetch } from "./transport.ts";

// The transport's own request, which read.test.ts reaches through readChain alone (always `no-store`): StrykerJS counts only
// the package's own tests for its code, so the request's exact shape and the timeout's reason are held here (F5187).
const URL_OK = "https://rpc.onyx.example:443/status";

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchBytes' request", () => {
  it("asks by GET, follows no redirect, accepts JSON alone, with the caller's credentials and no cache of its own", async () => {
    const inits: (RequestInit | undefined)[] = [];
    const fetch: ChainFetch = (_url, init) => {
      inits.push(init);
      return Promise.resolve(new Response("{}"));
    };
    await fetchBytes(URL_OK, { fetch, credentials: "same-origin" });
    await fetchBytes(URL_OK, { fetch, credentials: "omit", cache: "no-store" });
    const shapes = inits.map((init) => {
      const { signal, ...rest } = init ?? {};
      return { ...rest, signal: signal instanceof AbortSignal };
    });
    expect(shapes).toStrictEqual([
      {
        method: "GET",
        credentials: "same-origin",
        redirect: "error",
        headers: { accept: "application/json" },
        signal: true,
      },
      {
        method: "GET",
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: true,
      },
    ]);
  });

  it("ends a deaf request at its limit by its signal, the reason a TimeoutError that says why", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetch: ChainFetch = (_url, init) => {
      signal = init?.signal ?? undefined;
      return new Promise(() => undefined);
    };
    const fetched = fetchBytes(URL_OK, { fetch, credentials: "omit", timeoutMs: 500 });
    await vi.advanceTimersByTimeAsync(500);
    expect(await fetched).toStrictEqual({ kind: "timeout" });
    expect(signal?.aborted).toBe(true);
    const reason: unknown = signal?.reason;
    expect(reason).toBeInstanceOf(DOMException);
    expect(reason instanceof DOMException ? [reason.name, reason.message] : []).toEqual([
      "TimeoutError",
      "the answer took too long",
    ]);
  });
});
