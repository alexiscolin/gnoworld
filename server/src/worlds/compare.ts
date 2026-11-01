// New families and batches are found by comparing the list read now with the one read last time: the chain gives no deploy date
// through the paths (7c-notes.md), and one transaction can deploy many packages (chain-feasibility.md, item 11). With no earlier
// list nothing is new. A realm that left the list is no news, and neither is one that comes back (the job keeps every realm it
// has seen, since a chain only adds them; a list cut short is no departure).
import { groupWorlds } from "./group.ts";

/** One namespace that gained this many realms or more in one pass is a batch: one deploy of many packages, not many products. */
export const BATCH_MIN = 5;

export interface Comparison {
  /** The realms on the new list and not on the old one. */
  readonly added: string[];
  /** The ids of the worlds that had no realm on the old list, once each. */
  readonly newWorlds: string[];
  readonly batches: { readonly namespace: string; readonly realms: string[] }[];
}

const sorted = (values: Iterable<string>): string[] => [...values].sort();

export function compareLists(before: readonly string[], after: readonly string[]): Comparison {
  const oldWorlds = groupWorlds(before);
  const known = new Set(oldWorlds.flatMap(({ realms }) => realms));
  const current = groupWorlds(after);
  const added = sorted(current.flatMap(({ realms }) => realms.filter((path) => !known.has(path))));
  if (known.size === 0) return { added, newWorlds: [], batches: [] };
  const oldIds = new Set(oldWorlds.map(({ id }) => id));
  const addedSet = new Set(added);
  const newWorlds = current.filter(({ id, realms }) => !oldIds.has(id) && realms.some((path) => addedSet.has(path)));
  const byNamespace = new Map<string, string[]>();
  for (const { namespace, realms } of current) {
    const fresh = realms.filter((path) => addedSet.has(path));
    byNamespace.set(namespace, [...(byNamespace.get(namespace) ?? []), ...fresh]);
  }
  return {
    added,
    newWorlds: newWorlds.map(({ id }) => id),
    batches: sorted(byNamespace.keys())
      .map((namespace) => ({ namespace, realms: sorted(byNamespace.get(namespace) ?? []) }))
      .filter(({ realms }) => realms.length >= BATCH_MIN),
  };
}
