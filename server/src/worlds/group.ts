// A world is a product (decision of 2026-11-01, 11): its realms grouped under the id core's `worldIdOf` reads from a path alone.
import { worldIdOf } from "@gnoworld/core";
import { RealmPath, WORLDS_CAPS } from "@gnoworld/schemas/indexer";

export interface Group {
  readonly id: string;
  readonly namespace: string;
  readonly realms: string[];
}

// The chain's own realms (names, users, params, validators…): its machinery, never a world (Alexis, 2026-11-07, D346).
const SYSTEM = "gno.land/r/sys/";

/** Whether `path` is one of the chain's own realms, which no pass reads nor writes. */
export const isSystem = (path: string): boolean => path.startsWith(SYSTEM);

/** The worlds of a list of realm paths, sorted by id, their realms sorted by path. A path that is no realm, or the chain's own, is dropped. */
export function groupWorlds(paths: readonly string[]): Group[] {
  const worlds = new Map<string, Group>();
  for (const path of new Set(paths)) {
    if (!RealmPath.safeParse(path).success || isSystem(path)) continue;
    const id = worldIdOf(path);
    const group = worlds.get(id) ?? { id, namespace: id.split("/")[0] ?? "", realms: [] };
    group.realms.push(path);
    worlds.set(id, group);
  }
  return [...worlds.values()]
    .map((group) => ({ ...group, realms: group.realms.sort() }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The paths a pass reads and writes: each world keeps its first 512 realms in sorted order (the file's cap), so one deployer's
 * hundreds of realms cannot refuse the file, nor be read again every pass. A path that is no realm is dropped too.
 */
export function keptPaths(paths: readonly string[]): string[] {
  return groupWorlds(paths).flatMap(({ realms }) => realms.slice(0, WORLDS_CAPS.realms));
}
