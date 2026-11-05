// A realm's exported functions with their parameters, read once from `vm/qfuncs` (9e): what the write rows, a page's `<gno-form>` and a
// proposed action are each checked against before a Call shows. Panels of one view that ask in the same moment share one request.
import { callFields, type CallField } from "@gnoworld/core";
import type { ReadOptions } from "@gnoworld/chain/read";
import { useEffect, useState } from "react";
import { readCallable } from "../../lib/chain/rpc.ts";

export interface Callable {
  name: string;
  params: { Name: string; Type: string }[];
}
export type Listing =
  { state: "loading" } | { state: "listed"; functions: Callable[] } | { state: "failed"; next: string };

// A rejection here is a bug, not a state: the browser's own report, as the other panels' are.
const report = (error: unknown): void => {
  reportError(error);
};

/** The functions of `realm` on the chain at `rpc`; read again, from nothing, when any of the three changes. */
export function useCallable(rpc: string, realm: string, options: ReadOptions | undefined): Listing {
  const [listing, setListing] = useState<Listing>({ state: "loading" });
  useEffect(() => {
    readCallable(rpc, realm, options)
      .then((read) => {
        setListing(read.ok ? { state: "listed", functions: read.value } : { state: "failed", next: read.failure.next });
      })
      .catch(report);
  }, [rpc, realm, options]);
  return listing;
}

/** The function `name` as a call carries it (a write, of the types a call carries) with its fields, or none: no such function,
 * a read, or a type no call carries. */
export function writeOf(listing: Listing, name: string): { function: Callable; fields: CallField[] } | undefined {
  if (listing.state !== "listed") return undefined;
  const found = listing.functions.find((each) => each.name === name);
  if (found === undefined) return undefined;
  const fields = callFields(found.params);
  return fields.ok ? { function: found, fields: fields.fields } : undefined;
}
