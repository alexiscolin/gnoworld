// A world of the worlds' file as the cosmos reads it (slice 7, 7d2 and 7d5): its id, its namespace, and of its realms their callers, and
// for the whole cosmos their paths, imports and calls where the file has them.
import { callersIn } from "@gnoworld/core";

/** A world of the file: what the scene reads of it, its realms' paths, imports and calls for the whole cosmos where the file has them. */
export interface CosmosWorld {
  readonly id: string;
  readonly namespace: string;
  readonly realms: readonly {
    readonly callers: number | null;
    readonly path?: string;
    readonly imports?: readonly string[];
    readonly calls?: number | null;
    readonly lastHeight?: number | null;
  }[];
  /** When the file first saw it, an ISO time, or null on a first pass. */
  readonly seen?: string | null | undefined;
}

/** Each world's id to the worlds it is built on: a realm's imports of another world's realms, counted once (space's sizes, its map's links). */
export function usesOf(worlds: readonly CosmosWorld[]): ReadonlyMap<string, ReadonlySet<string>> {
  const owner = new Map<string, string>();
  for (const world of worlds) for (const { path } of world.realms) if (path !== undefined) owner.set(path, world.id);
  const uses = new Map<string, Set<string>>();
  for (const world of worlds) {
    const used = world.realms.flatMap(({ imports = [] }) => imports.flatMap((path) => owner.get(path) ?? []));
    const others = used.filter((id) => id !== world.id);
    if (others.length > 0) uses.set(world.id, new Set(others));
  }
  return uses;
}

// How many other worlds are built on each world, by its id: all of them, and those of other namespaces (P1).
function importersOf(worlds: readonly CosmosWorld[]): {
  all: ReadonlyMap<string, number>;
  across: ReadonlyMap<string, number>;
} {
  const namespace = new Map(worlds.map(({ id, namespace: of }) => [id, of]));
  const [all, across] = [new Map<string, number>(), new Map<string, number>()];
  for (const [user, used] of usesOf(worlds))
    for (const id of used) {
      all.set(id, (all.get(id) ?? 0) + 1);
      if (namespace.get(id) !== namespace.get(user)) across.set(id, (across.get(id) ?? 0) + 1);
    }
  return { all, across };
}

/** The worlds as the cosmos places them, each by its id, its namespace, its use (the people who called it and the worlds built on it, never
 * how many realms it holds) and its rank among systems, whose imports count from other namespaces alone (a kit's copies importing each
 * other is no busier for it). */
function heldOf(worlds: readonly CosmosWorld[]) {
  const { all, across } = importersOf(worlds);
  return worlds.map((world) => {
    const callers = callersIn(world.realms);
    return {
      id: world.id,
      namespace: world.namespace,
      use: callers + (all.get(world.id) ?? 0),
      rank: callers + (across.get(world.id) ?? 0),
    };
  });
}

/** The worlds of `list` by namespace, each with its use. */
export function byNamespace(list: readonly CosmosWorld[]): Map<string, { id: string; use: number; rank: number }[]> {
  const groups = new Map<string, { id: string; use: number; rank: number }[]>();
  for (const world of heldOf(list)) {
    const group = groups.get(world.namespace) ?? [];
    group.push(world);
    groups.set(world.namespace, group);
  }
  return groups;
}
