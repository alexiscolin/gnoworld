import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBytes, requestInit, type ChainFetch, type ChainInit } from "./transport.ts";

// The transport's own request, which read.test.ts reaches through readChain alone (always `no-store`): StrykerJS counts only
// the package's own tests for its code, so the request's exact shape and the timeout's reason are held here (F5187).
const URL_OK = "https://rpc.onyx.example:443/status";

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchBytes' request", () => {
  it("asks by GET, follows no redirect, accepts JSON alone, with the caller's credentials and no cache of its own", async () => {
    const inits: (ChainInit | undefined)[] = [];
    const fetch: ChainFetch = (_url, init) => {
      inits.push(init);
      return Promise.resolve(new Response("{}"));
    };
    await fetchBytes(URL_OK, { fetch, credentials: "same-origin" });
    await fetchBytes(URL_OK, { fetch, credentials: "omit", cache: "no-store" });
    const shapes = inits.map((init) => {
      const { signal, onWait, ...rest } = init ?? {};
      return { ...rest, signal: signal instanceof AbortSignal, onWait: typeof onWait === "function" };
    });
    expect(shapes).toStrictEqual([
      {
        method: "GET",
        credentials: "same-origin",
        redirect: "error",
        headers: { accept: "application/json" },
        signal: true,
        onWait: true,
      },
      {
        method: "GET",
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: true,
        onWait: true,
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

  // A gate in front of the transport (the page's per-host queue, app/src/lib/query/policy.ts) says when a request waits its turn.
  const queued =
    (wait: number, answer: () => Promise<Response>): ChainFetch =>
    async (_url, init) => {
      init?.onWait?.(true);
      await new Promise((resolve) => setTimeout(resolve, wait));
      init?.onWait?.(false);
      return answer();
    };

  it("runs from the request's turn: the time it waited in a queue is not counted against it", async () => {
    vi.useFakeTimers();
    const fetched = fetchBytes(URL_OK, {
      fetch: queued(900, () => Promise.resolve(new Response("{}"))),
      credentials: "omit",
      timeoutMs: 500,
    });
    await vi.advanceTimersByTimeAsync(900);
    expect(await fetched).toStrictEqual({ bytes: new TextEncoder().encode("{}"), status: 200 });
  });

  it("still gives up at its time once its turn has come", async () => {
    vi.useFakeTimers();
    const fetched = fetchBytes(URL_OK, {
      fetch: queued(900, () => new Promise(() => undefined)),
      credentials: "omit",
      timeoutMs: 500,
    });
    await vi.advanceTimersByTimeAsync(1399);
    let settled = false;
    fetched.then(
      () => (settled = true),
      () => undefined,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await fetched).toStrictEqual({ kind: "timeout" });
  });
});

describe("requestInit", () => {
  it("gives a way out with no gate the request's options without the gate's hook, and none for none", () => {
    const signal = new AbortController().signal;
    expect(requestInit({ method: "GET", signal, onWait: () => undefined })).toStrictEqual({ method: "GET", signal });
    expect(requestInit()).toStrictEqual({});
  });
});
