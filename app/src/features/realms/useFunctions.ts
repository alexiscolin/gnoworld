// What a realm's read functions need (5i): the list of names, once, from `vm/qfuncs`, and the result of each call a click
// asks, from `vm/qeval` and the height it was read at. A read that fails is a state with its next step, never a blank.
import { useEffect, useState } from "react";
import type { Failure, ReadOptions } from "../../lib/chain/read.ts";
import { readEval, readFunctions, readHeight } from "../../lib/chain/rpc.ts";
import type { Height } from "./useRealm.ts";

type Listing = { state: "loading" } | { state: "listed"; names: string[] } | { state: "failed"; next: string };

export type Result =
  { state: "busy" } | { state: "read"; text: string; height: Height | Failure } | { state: "failed"; next: string };

export interface Functions {
  listing: Listing;
  results: Readonly<Record<string, Result>>;
  /** Reads one call; the name is lib/chain's to check. */
  read: (name: string) => void;
}

/** The functions that take nothing and give something, and what a click on each read. A new realm or RPC is a new mount. */
export function useFunctions(rpc: string, realm: string, options?: ReadOptions): Functions {
  const [listing, setListing] = useState<Listing>({ state: "loading" });
  const [results, setResults] = useState<Readonly<Record<string, Result>>>({});

  useEffect(() => {
    let live = true;
    readFunctions(rpc, realm, options).then(
      (read) => {
        if (!live) return;
        setListing(
          read.ok
            ? {
                state: "listed",
                names: [...new Set(read.value.filter(({ readable }) => readable).map(({ name }) => name))],
              }
            : { state: "failed", next: read.failure.next },
        );
      },
      () => {
        if (live) setListing({ state: "failed", next: "The list could not be drawn. Try again in a moment." });
      },
    );
    return () => {
      live = false;
    };
  }, [rpc, realm, options]);

  const settle = (name: string, result: Result) => {
    setResults((before) => ({ ...before, [name]: result }));
  };
  const read = (name: string) => {
    settle(name, { state: "busy" });
    Promise.all([readEval(rpc, { realm, name }, options), readHeight(rpc, options)]).then(
      ([text, height]) => {
        settle(
          name,
          text.ok
            ? { state: "read", text: text.value, height: height.ok ? height.value : height.failure }
            : { state: "failed", next: text.failure.next },
        );
      },
      () => {
        settle(name, { state: "failed", next: "The read could not be drawn. Try again in a moment." });
      },
    );
  };
  return { listing, results, read };
}
