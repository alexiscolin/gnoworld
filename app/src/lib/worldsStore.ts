// The worlds' file as the store's realms (D373), and the store built from it once per file: Discover and a realm's page (its version family)
// share it, so a page view costs a lookup, never a pass over every realm. The phase-2 columns the file does not give yet stay null.
import { storeOf, type Store, type StoreRealm } from "@gnoworld/core";
import type { Worlds } from "@gnoworld/schemas/indexer";

function realmsOf(worlds: Worlds["worlds"]): StoreRealm[] {
  return worlds.flatMap((world) =>
    world.realms.map((realm) => ({
      path: realm.path,
      namespace: world.namespace,
      author: realm.deployerName,
      functions: realm.functions,
      imports: realm.imports,
      calls: realm.calls ?? 0,
      callers: realm.callers ?? 0,
      lastHeight: realm.lastHeight,
      firstHeight: null,
      rise: null,
      world: world.id,
    })),
  );
}

const built = new WeakMap<Worlds["worlds"], Store>();

/** The store of a worlds' file, built the first time it is asked and kept as long as the file is. */
export function storeFor(worlds: Worlds["worlds"]): Store {
  const held = built.get(worlds) ?? storeOf(realmsOf(worlds));
  built.set(worlds, held);
  return held;
}
