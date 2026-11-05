// The way out as the server's timers meet it at the stack's start (F4872): what fetch throws when a call reaches nothing, as Node 24.22.0
// (.node-version's, the server's build stage) and 26.12.0 give it, measured on 2026-11-05 (a TypeError whose causes carry a code, the way
// out's refusal of a tunnel two causes down; their messages name the host, which nothing reads), a way out that fails a job's first call,
// and the waits it then asks.
import { vi } from "vitest";
import type { Send } from "../net.ts";

/** A cause as Node or undici sets it: its code, and a message naming what it tried. */
export const coded = (code: unknown, name = "Error"): Error =>
  Object.assign(new Error("connect guard:4750 10.1.2.3"), { name, code });

/** fetch's own fault, each cause holding the next. */
export const fetchFailed = (...causes: Error[]): TypeError =>
  new TypeError("fetch failed", {
    cause: causes.reduceRight<Error | undefined>((inner, outer) => Object.assign(outer, { cause: inner }), undefined),
  });

/** The way out's name with no address yet: Compose starts the server before it. */
export const unresolved = (): TypeError => fetchFailed(coded("ENOTFOUND"));

/** Nothing listening yet where the way out will be. */
export const refused = (): TypeError => fetchFailed(coded("ECONNREFUSED"));

/** The way out refusing the tunnel (smokescreen's 407 for a host its list does not name), two causes down. */
export const proxyRefused = (): TypeError => fetchFailed(coded(0), coded("UND_ERR_ABORTED", "AbortError"));

/** `through`, but its first call fails with `first`. */
export function failingFirst(first: () => Error, through: Send): Send {
  let calls = 0;
  return (url, init, ms) => ((calls += 1) === 1 ? Promise.reject(first()) : through(url, init, ms));
}

/** Every wait of a second or more a timer asks from now, in order: one of 15 s runs at once, any other never within the test. Restored by
 * the test's `vi.restoreAllMocks()`. */
export function timerWaits(): number[] {
  const asked: number[] = [];
  const real = globalThis.setTimeout;
  vi.spyOn(globalThis, "setTimeout").mockImplementation((fn: () => void, ms?: number) => {
    if (ms === undefined || ms < 1000) return real(fn, ms);
    asked.push(ms);
    return real(fn, ms === 15_000 ? 0 : 3_600_000);
  });
  return asked;
}
