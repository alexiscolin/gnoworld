// What a realm's read functions need (5i): the list of names, once, from `vm/qfuncs`, and the result of each call a click
// asks, from `vm/qeval` and the height it was read at. A read that fails is a state with its next step, never a blank. Each
// function's card keeps one read in flight, starts one per 400 ms, gives it 10 s and reads 64 KB of the answer (D13301).
import { useEffect, useRef, useState } from "react";
import type { Failure, ReadOptions } from "@gnoworld/chain/read";
import { readHeight } from "@gnoworld/chain/node";
import type { Read } from "../../lib/chain/evalCall.ts";
import { readEval, readFunctions } from "../../lib/chain/rpc.ts";
import type { Height } from "./useRealm.ts";

type Listing = { state: "loading" } | { state: "listed"; names: string[] } | { state: "failed"; next: string };

export type Result =
  | { state: "busy" }
  /** The call's text, shown at once; `height` is when it was read, why that is unknown, or none yet (still being asked). */
  | { state: "read"; text: string; height: Height | Failure | undefined }
  | { state: "failed"; next: string };

// A rejection here is a bug, not a state (lib/chain's reads never reject): the browser's own report, as the views' are.
const report = (error: unknown): void => {
  reportError(error);
};

export interface Functions {
  listing: Listing;
  results: Readonly<Record<string, Result>>;
  /** Reads one call, with its texts for its parameters when it takes some; the name and the texts are lib/chain's to check. */
  read: (name: string, call?: Read) => void;
}

// A card's reads: when its last one started, the one under way, and the one waiting its turn.
interface Card {
  at: number;
  flying?: AbortController | undefined;
  waiting?: ReturnType<typeof setTimeout> | undefined;
}

/** The functions that take nothing and give something, and what a click on each read. A new realm or RPC is a new mount. */
export function useFunctions(rpc: string, realm: string, options?: ReadOptions): Functions {
  const [listing, setListing] = useState<Listing>({ state: "loading" });
  const [results, setResults] = useState<Readonly<Record<string, Result>>>({});

  // The panel is a new mount for a new realm or chain (RealmFunctions' key), which drops what a late answer would bring: the
  // effect has no flag of its own, and React ignores a state set after an unmount.
  useEffect(() => {
    readFunctions(rpc, realm, options)
      .then((read) => {
        setListing(
          read.ok
            ? {
                state: "listed",
                names: [...new Set(read.value.filter(({ readable }) => readable).map(({ name }) => name))],
              }
            : { state: "failed", next: read.failure.next },
        );
      })
      .catch(report);
  }, [rpc, realm, options]);

  // Leaving ends each card's read under way and drops the one waiting.
  const cardsRef = useRef(new Map<string, Card>());
  useEffect(() => {
    const held = cardsRef.current;
    return () => {
      for (const card of held.values()) {
        clearTimeout(card.waiting);
        card.flying?.abort();
      }
      held.clear();
    };
  }, []);

  const settle = (name: string, result: Result) => {
    setResults((before) => ({ ...before, [name]: result }));
  };
  // The text first; the height, a neighbour of the read and a request of its own, follows when it comes. A height is kept only
  // by the read it was asked for: a later click replaces that read, and its height is its own. A read a later one ended settles nothing.
  const ask = (name: string, call: Read | undefined, signal: AbortSignal) => {
    readEval(rpc, { realm, name, ...call }, { ...options, timeoutMs: 10_000, maxBytes: 64 * 1024, signal })
      .then((text) => {
        if (signal.aborted) return undefined;
        if (!text.ok) {
          settle(name, { state: "failed", next: text.failure.next });
          return undefined;
        }
        const shown: Result = { state: "read", text: text.value, height: undefined };
        settle(name, shown);
        return readHeight(rpc, { ...options, chainId: null }).then((height) => {
          setResults((before) =>
            before[name] === shown
              ? { ...before, [name]: { ...shown, height: height.ok ? height.value : height.failure } }
              : before,
          );
        });
      })
      .catch(report);
  };
  // A card's read starts at once, or 400 ms after its last one started, the last asked meanwhile kept; it ends the one under way.
  const read = (name: string, call?: Read) => {
    settle(name, { state: "busy" });
    const card = cardsRef.current.get(name) ?? { at: -Infinity };
    cardsRef.current.set(name, card);
    clearTimeout(card.waiting);
    const start = () => {
      card.flying?.abort();
      const flying = new AbortController();
      Object.assign(card, { at: Date.now(), flying, waiting: undefined });
      ask(name, call, flying.signal);
    };
    const wait = card.at + 400 - Date.now();
    if (wait > 0) card.waiting = setTimeout(start, wait);
    else start();
  };
  return { listing, results, read };
}
