// A world is a product (decision of 2026-11-01, 11): the realms of one product under it, found from paths alone. A world is a
// namespace and the first folder under it, the text before its first `_` (memba_feed_v1 and memba_gov are `memba`), a trailing
// `/vN` version dropped. Under a generic folder (`x`, `demo`) the whole path minus its version stands: one namespace there holds
// hundreds of unrelated realms. A realm that is its namespace alone is a world of its own, named by the namespace.
import { RealmPath } from "@gnoworld/schemas";

export interface Group {
  readonly id: string;
  readonly namespace: string;
  readonly realms: string[];
}

const GENERIC = ["x", "demo"];
const PREFIX = "gno.land/r/";

function worldOf(segments: readonly string[]): string {
  const [namespace = "", folder = ""] = segments;
  const unversioned = segments.length > 1 && /^v[0-9]+$/.test(segments.at(-1) ?? "") ? segments.slice(0, -1) : segments;
  if (unversioned.length === 1) return namespace;
  if (GENERIC.includes(folder)) return unversioned.join("/");
  return `${namespace}/${unversioned[1]?.split("_")[0] ?? ""}`;
}

/** The worlds of a list of realm paths, sorted by id, their realms sorted by path. A path that is no realm is dropped. */
export function groupWorlds(paths: readonly string[]): Group[] {
  const worlds = new Map<string, Group>();
  for (const path of new Set(paths)) {
    if (!RealmPath.safeParse(path).success) continue;
    const segments = path.slice(PREFIX.length).split("/");
    const id = worldOf(segments);
    const group = worlds.get(id) ?? { id, namespace: segments[0] ?? "", realms: [] };
    group.realms.push(path);
    worlds.set(id, group);
  }
  return [...worlds.values()]
    .map((group) => ({ ...group, realms: group.realms.sort() }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
