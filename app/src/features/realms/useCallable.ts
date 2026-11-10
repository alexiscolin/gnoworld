// A realm's exported functions with their parameters, read once from `vm/qfuncs` (9e): what the write rows, a page's `<gno-form>` and a
// proposed action are each checked against before a Call shows. Panels of one view that ask in the same moment share one request.
import { callFields, type CallField } from "@gnoworld/core";
import type { ChainRead, ReadOptions } from "@gnoworld/chain/read";
import { useQuery } from "@tanstack/react-query";
import { createContext, use } from "react";
import { realmFunctions, toCallable } from "../../lib/chain/rpc.ts";
import { isUnread, queryClient } from "../../lib/query/client.ts";

export interface Callable {
  name: string;
  params: { Name: string; Type: string }[];
}
export type Listing =
  { state: "loading" } | { state: "listed"; functions: Callable[] } | { state: "failed"; next: string };

/** The listing a realm view already read, for the forms its page holds: they mount after the page is read, when the panels'
 * shared request has ended, and would ask again. It names the chain and realm it was read for: a reader of another one ignores it. */
export interface Shared {
  key: string;
  listing: Listing;
}
export const ListingContext = createContext<Shared | undefined>(undefined);

/** The functions of `realm` on the chain at `rpc`, read again from nothing when any of the three changes, and an answer that comes
 * late for an earlier one dropped. Inside a realm view (`ListingContext`) the view's own listing when it is of this realm and
 * chain, with no read of its own. */
export function useCallable(rpc: string, realm: string, options: ReadOptions | undefined): Listing {
  return useRead({ rpc, realm, options, shared: use(ListingContext) }).listing;
}

/** The read itself, for a realm view to share (`ListingContext`) and for a reader outside one; a `shared` listing of this realm and
 * chain is taken as it is, unread. */
export function useRead({
  rpc,
  realm,
  options,
  shared,
}: {
  rpc: string;
  realm: string;
  options: ReadOptions | undefined;
  shared?: Shared | undefined;
}): Shared {
  const key = `${rpc} ${realm}`;
  const mine = shared?.key === key;
  // A listing shared by the view above is taken as it is, unread; the kept one (a place seen again) shows at once, and a fresh read that
  // failed leaves it.
  const { data, error } = useQuery(
    { ...realmFunctions(rpc, realm, options), enabled: !mine, select: toCallable },
    queryClient,
  );
  if (mine) return shared;
  if (data?.ok === true) return { key, listing: { state: "listed", functions: data.value } };
  if (isUnread<ChainRead<unknown>>(error) && !error.read.ok)
    return { key, listing: { state: "failed", next: error.read.failure.next } };
  return { key, listing: { state: "loading" } };
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
