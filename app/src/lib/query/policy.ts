// How every source is asked (slice 13, D13973), the one way: the chain's RPC and indexer, the site's own files and the server's reads all pass
// the per-host cap below, and the transport under them (packages/chain's fetchBytes) already holds the rest: one time limit and the query's
// own signal (withinTime), a size cap, no redirect, an answer that is a kind and never a throw. Retries and what is never retried: client.ts.
// No second endpoint exists to fall back to: app/data/universes.json lists one RPC and one indexer a chain.
import type { ChainFetch } from "@gnoworld/chain/transport";

/** The most requests of one host in flight at once: the public RPC is shared, so a view that asks for ten things waits its turn. */
export const HOST_AT_ONCE = 4;

/** A request's options at the gate: `onWait(true)` when it starts waiting for its turn, `onWait(false)` when the turn comes. */
type GatedInit = RequestInit & { onWait?: (waiting: boolean) => void };
export type GatedFetch = (url: string, init?: GatedInit) => Promise<Response>;

/** `base`, with at most `HOST_AT_ONCE` requests of a host in flight; the rest wait in order, and one cut short while it waits is never asked. */
export function gated(base: ChainFetch): GatedFetch {
  const busy = new Map<string, { running: number; waiting: (() => void)[] }>();
  return async (url, init) => {
    const host = new URL(url, "https://own.site").host;
    const lane = busy.get(host) ?? { running: 0, waiting: [] };
    busy.set(host, lane);
    if (lane.running >= HOST_AT_ONCE) {
      init?.onWait?.(true);
      await new Promise<void>((resolve, reject) => {
        const turn = () => {
          init?.signal?.removeEventListener("abort", leave);
          init?.onWait?.(false);
          resolve();
        };
        const leave = () => {
          lane.waiting.splice(lane.waiting.indexOf(turn), 1);
          reject(new DOMException("The request was cut short while it waited", "AbortError"));
        };
        lane.waiting.push(turn);
        init?.signal?.addEventListener("abort", leave, { once: true });
      });
    } else {
      lane.running += 1;
    }
    try {
      return await base(url, init);
    } finally {
      const next = lane.waiting.shift();
      if (next === undefined) lane.running -= 1;
      else next();
    }
  };
}

/** The page's own gate: every query's reads go through it. */
export const pageFetch: GatedFetch = gated((url, init) => fetch(url, init));
