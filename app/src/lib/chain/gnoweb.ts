// Where a chain's gnoweb is (5h): the one place that names a gnoweb host. ADR-0002 §4 makes gnoweb the source of truth, and
// a realm's card and view each link to the realm there. The two hosts are those of the answers recorded through gnomcp
// (tests/chain/chainFixture.ts: gnoland-1's and onyx-1's pages); a `gnoweb` field in a universe's data (docs/plans/
// slice-5-part-2.md, question to Alexis, F2906) replaces GNOWEB with one line.
import { originOf } from "@gnoworld/core";

const GNOWEB: ReadonlyMap<string, string> = new Map([
  ["gnoland-1", "https://gno.land"],
  ["onyx-1", "https://onyx.testnets.gno.land"],
]);

/** A chain's gnoweb origin by its chain id: the two the data names today. */
export function gnowebOrigin(chainId: string): string | undefined {
  return GNOWEB.get(chainId);
}

/** A realm's address on gnoweb: its path (`gno.land/r/demo/dao` or `/r/demo/dao`) under gnoweb's own origin, with the number of
 * one of its pages when given (`/r/gov/dao:15`), or none when the origin is not `https://host[:port]`, the path would lead off it
 * or the page is no whole number of 0 or more. */
export function gnowebLink(origin: string, realm: string, page?: number): string | undefined {
  const base = originOf(origin);
  const path = realm.replace(/^[^/]+(?=\/r\/)/, "");
  if (base === undefined || !/^\/r\/[A-Za-z0-9_/-]+$/.test(path) || path.includes("//")) return undefined;
  if (page === undefined) return `${base}${path}`;
  return Number.isSafeInteger(page) && page >= 0 ? `${base}${path}:${String(page)}` : undefined;
}
