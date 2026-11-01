// The realm a path names (5h): /r/<path> in the default universe, /net/<id>/r/<path> in another, read from that universe's
// chain. A client route's address, with no page written ahead (docs/plans/slice-5-part-2.md §1): the path is the realm's, so
// it passes gno's grammar for one (lib/chain's isRealmPath) or it names nothing.
import universes from "../data/universes.json" with { type: "json" };
import { isRealmPath } from "./lib/chain/evalCall.ts";
import { site } from "./places.ts";

/** A realm of a universe, and where to read it. */
export interface RealmAt {
  /** `gno.land/r/demo/dao`. */
  realm: string;
  chain: { name: string; chainId: string; rpc: string; gnoweb: string; indexer: string };
  /** The universe's home: where Back goes with nothing in the site behind the view. */
  home: string;
}

/** The realm a request's path names, or none: a path of no universe, or one gno reads as no realm. */
export function realmAt(pathname: string): RealmAt | undefined {
  const found = /^(?:\/net\/([^/]+))?\/r\/(.+?)\/?$/.exec(pathname);
  const rest = found?.[2];
  if (found === null || rest === undefined) return undefined;
  const universe = site.universeAt(pathname);
  const row = universes.find((each) => each.id === universe.id);
  const realm = `gno.land/r/${rest}`;
  if (row === undefined || (found[1] !== undefined && found[1] !== universe.id) || !isRealmPath(realm))
    return undefined;
  return {
    realm,
    chain: { name: row.name, chainId: row.chainId, rpc: row.rpc, gnoweb: row.gnoweb, indexer: row.indexer },
    home: universe.home.path,
  };
}
