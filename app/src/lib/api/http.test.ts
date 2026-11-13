import { afterEach, describe, expect, it, vi } from "vitest";
import * as z from "zod/mini";
import { gated, HOST_AT_ONCE } from "../query/policy.ts";
import { jsonCall, TIMEOUT_MS, type Fetcher } from "./http.ts";

// The one JSON call of lib/api: its signal and its time limit, on the browsers the build targets and behind the page's per-host queue.
const schema = z.object({ n: z.number() });
const answering: Fetcher = () => Promise.resolve(new Response(JSON.stringify({ n: 1 }), { status: 200 }));
const hanging: Fetcher = (_url, init) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      reject(new DOMException("aborted", "AbortError"));
    });
  });

afterEach(() => {
  vi.useRealTimers();
});

describe("a call's signal", () => {
  it("reads a call that carries a signal on a browser with no AbortSignal.any (Chrome before 116, Safari before 17.4)", async () => {
    const any = Object.getOwnPropertyDescriptor(AbortSignal, "any");
    Reflect.deleteProperty(AbortSignal, "any");
    try {
      const result = await jsonCall(answering)({ path: "/api/x", schema, signal: new AbortController().signal });
      expect(result).toEqual({ ok: true, value: { n: 1 } });
    } finally {
      if (any !== undefined) Object.defineProperty(AbortSignal, "any", any);
    }
  });

  it("ends the call when its signal aborts, and leaves no listener on that signal once it settles", async () => {
    const outer = new AbortController();
    const added = vi.spyOn(outer.signal, "addEventListener");
    const removed = vi.spyOn(outer.signal, "removeEventListener");
    const pending = jsonCall(hanging)({ path: "/api/x", schema, signal: outer.signal });
    outer.abort();
    expect(await pending).toEqual({ ok: false, reason: "network" });
    expect(added.mock.calls.map(([type, listener]) => [type, listener])).toEqual(
      removed.mock.calls.map(([type, listener]) => [type, listener]),
    );
    const done = new AbortController();
    const kept = vi.spyOn(done.signal, "removeEventListener");
    await jsonCall(answering)({ path: "/api/x", schema, signal: done.signal });
    expect(kept).toHaveBeenCalledTimes(1);
  });

  it("asks nothing for a call whose signal has already aborted", async () => {
    const outer = new AbortController();
    outer.abort();
    const seen: string[] = [];
    const result = await jsonCall((url) => {
      seen.push(url);
      return Promise.reject(new DOMException("aborted", "AbortError"));
    })({ path: "/api/x", schema, signal: outer.signal });
    expect(result).toEqual({ ok: false, reason: "network" });
    expect(seen).toEqual([]);
  });
});

describe("a call's time", () => {
  it("runs from the call's turn: the time it waited in the page's per-host queue is not counted against it", async () => {
    vi.useFakeTimers();
    const ends: (() => void)[] = [];
    const fetcher = gated((url, init) =>
      url.endsWith("/busy")
        ? new Promise<Response>((resolve) => {
            ends.push(() => {
              resolve(new Response("{}"));
            });
          })
        : answering(url, init),
    );
    const busy = Array.from({ length: HOST_AT_ONCE }, () => fetcher("/busy"));
    let done: unknown;
    const queued = jsonCall(fetcher)({ path: "/api/x", schema }).then((result) => {
      done = result;
    });
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS + 5_000);
    expect(done).toBeUndefined();
    for (const end of ends.splice(0)) end();
    await Promise.all(busy);
    await queued;
    expect(done).toEqual({ ok: true, value: { n: 1 } });
  });

  it("still gives up at its time once its turn has come", async () => {
    vi.useFakeTimers();
    let done: unknown;
    const pending = jsonCall(gated(hanging))({ path: "/api/x", schema }).then((result) => {
      done = result;
    });
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
    expect(done).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(done).toEqual({ ok: false, reason: "network" });
    expect(vi.getTimerCount()).toBe(0);
  });
});
