// Whether a realm exists, as far as anything read says: the page asks it before it draws a planet, a room, a visit or a pill for a
// path nothing proved. The realm's own read is the plate's (useRealm); this only looks at what that read left in the query cache,
// so the route that asks carries none of its code.
import { skipToken, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { isUnread, queryClient, quietUnread } from "../../lib/query/client.ts";
import { keys } from "../../lib/query/keys.ts";
import { knownOf, type Known } from "../../realmKnown.ts";
import type { Realm, RealmSource } from "./useRealm.ts";

export type { Known } from "../../realmKnown.ts";

// The realm's page read, its code in a chunk of its own; out of the hook, where the React Compiler takes no import().
const readPage = (source: RealmSource) => {
  import("./useRealm.ts")
    .then(({ realmPageQuery }) => queryClient.query(realmPageQuery(source)).catch(quietUnread))
    .catch(reportError);
};

/** `knownOf` for the realm of `source`, as its read comes into the cache; `listed` is whether the worlds' file holds it. `ask` reads the
 * realm's page here (a phone, which draws no plate to read it); its code comes in a chunk then, never with this route's. */
export function useKnown({ rpc, realm, origin }: RealmSource, listed: boolean, ask = false): Known {
  useEffect(() => {
    if (ask) readPage({ rpc, realm, origin });
  }, [ask, rpc, realm, origin]);
  const { data, error } = useQuery<Realm>({ queryKey: keys.page(rpc, realm, origin), queryFn: skipToken }, queryClient);
  return knownOf(listed, data ?? (isUnread<Realm>(error) ? error.read : undefined));
}
