// A realm's address on its chain's gnoweb (5h). ADR-0002 §4 makes gnoweb the source of truth, and a realm's card and view each link to
// the realm there. Where a chain's gnoweb is comes from the data (`gnoweb` of a universe in app/data/universes.json, https and a bare
// origin by the schema): this file holds no host.
import { originOf } from "@gnoworld/core";

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
