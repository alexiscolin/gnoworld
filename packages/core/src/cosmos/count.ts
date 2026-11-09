// What the hero counts (slice 7d6): the worlds the cosmos draws from a file, each once in its namespace as `systemsOf` holds them, and the
// Earth beside them. Alone in its module, so the page that reads the file pays for nothing else of the cosmos.

export { planetCount } from "./crowd.ts";

/** The worlds the cosmos draws from a file, and the Earth. */
export function worldsDrawn(worlds: readonly { readonly id: string; readonly namespace: string }[]): number {
  const held = new Map<string, Set<string>>();
  for (const { id, namespace } of worlds) held.set(namespace, (held.get(namespace) ?? new Set<string>()).add(id));
  return [...held.values()].reduce((sum, ids) => sum + ids.size, 1);
}
