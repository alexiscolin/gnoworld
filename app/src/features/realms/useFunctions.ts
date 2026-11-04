// What a realm's read functions need (5i): the list of names, once, from `vm/qfuncs`, and the result of each call a click
// asks, from `vm/qeval` and the height it was read at. A read that fails is a state with its next step, never a blank.
import { useEffect, useState } from "react";
import type { Failure, ReadOptions } from "@gnoworld/chain/read";
import { readHeight } from "@gnoworld/chain/node";
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
  /** Reads one call; the name is lib/chain's to check. */
  read: (name: string) => void;
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

  const settle = (name: string, result: Result) => {
    setResults((before) => ({ ...before, [name]: result }));
  };
  // The text first; the height, a neighbour of the read and a request of its own, follows when it comes. A height is kept only
  // by the read it was asked for: a later click replaces that read, and its height is its own.
  const read = (name: string) => {
    settle(name, { state: "busy" });
    readEval(rpc, { realm, name }, options)
      .then((text) => {
        if (!text.ok) {
          settle(name, { state: "failed", next: text.failure.next });
          return undefined;
        }
        const shown: Result = { state: "read", text: text.value, height: undefined };
        settle(name, shown);
        return readHeight(rpc, options).then((height) => {
          setResults((before) =>
            before[name] === shown
              ? { ...before, [name]: { ...shown, height: height.ok ? height.value : height.failure } }
              : before,
          );
        });
      })
      .catch(report);
  };
  return { listing, results, read };
}
