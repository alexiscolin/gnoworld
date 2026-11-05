// A realm's exported functions with their parameters, read once from `vm/qfuncs` (9e): what the write rows, a page's `<gno-form>` and a
// proposed action are each checked against before a Call shows. Panels of one view that ask in the same moment share one request.
import { callFields, type CallField } from "@gnoworld/core";
import type { ReadOptions } from "@gnoworld/chain/read";
import { createContext, use, useEffect, useState } from "react";
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

/** The listing a realm view already read, for the forms its page holds: they mount after the page is read, when the panels'
 * shared request has ended, and would ask again. */
export const ListingContext = createContext<Listing | undefined>(undefined);

/** The functions of `realm` on the chain at `rpc`; read again, from nothing, when any of the three changes. Inside a realm view
 * (`ListingContext`) the view's own listing, with no read of its own. */
export function useCallable(rpc: string, realm: string, options: ReadOptions | undefined): Listing {
  const shared = use(ListingContext);
  const [listing, setListing] = useState<Listing>({ state: "loading" });
  useEffect(() => {
    if (shared !== undefined) return;
    readCallable(rpc, realm, options)
      .then((read) => {
        setListing(read.ok ? { state: "listed", functions: read.value } : { state: "failed", next: read.failure.next });
      })
      .catch(report);
  }, [rpc, realm, options, shared]);
  return shared ?? listing;
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
