// Whether a realm exists, as far as anything read says: the page asks it before it draws a planet, a room, a visit or a pill for a
// path nothing proved. The realm's own read is the plate's (useRealm); this only looks at what that read left in the query cache,
// so the route that asks carries none of its code.
import { skipToken, useQuery } from "@tanstack/react-query";
import { isUnread, queryClient } from "../../lib/query/client.ts";
import { keys } from "../../lib/query/keys.ts";
import type { Realm, RealmSource } from "./useRealm.ts";

export type Known = "unknown" | "yes" | "no";

/** The chain's own "no realm" wins; else a page that was read or a listing in the worlds' file says yes; a down or slow chain, none. */
export function knownOf(listed: boolean, read: Realm | undefined): Known {
  const failed = read?.state === "failed" ? read.failure?.kind : undefined;
  if (failed === "no-realm") return "no";
  return listed || read?.state === "read" || failed === "no-page" ? "yes" : "unknown";
}

/** `knownOf` for the realm of `source`, as its read comes into the cache; `listed` is whether the worlds' file holds it. */
export function useKnown({ rpc, realm, origin }: RealmSource, listed: boolean): Known {
  const { data, error } = useQuery<Realm>({ queryKey: keys.page(rpc, realm, origin), queryFn: skipToken }, queryClient);
  return knownOf(listed, data ?? (isUnread<Realm>(error) ? error.read : undefined));
}
