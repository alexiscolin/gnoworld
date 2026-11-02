// A world is a product (decision of 2026-11-01, 11): the realms of one product under it, found from paths alone. A world is a namespace and
// the first folder under it, the text before its first `_` (memba_feed_v1 and memba_gov are `memba`), a trailing `/vN` version dropped. Under
// a generic folder (`x`, `demo`) the whole path minus its version stands: one namespace there holds hundreds of unrelated realms. A realm
// that is its namespace alone is a world of its own. The server's job groups by it, and a world's page draws the planet of the same id.

const GENERIC = ["x", "demo"];
const PREFIX = "gno.land/r/";

/** The world of a realm's path on gno.land. */
export function worldIdOf(path: string): string {
  const segments = path.slice(PREFIX.length).split("/");
  const [namespace = "", folder = ""] = segments;
  const unversioned = segments.length > 1 && /^v[0-9]+$/.test(segments.at(-1) ?? "") ? segments.slice(0, -1) : segments;
  if (unversioned.length === 1) return namespace;
  if (GENERIC.includes(folder)) return unversioned.join("/");
  return `${namespace}/${unversioned[1]?.split("_")[0] ?? ""}`;
}
