// A realm's version family (D373), from the store the worlds' file builds once (lib/worldsStore.ts): one lookup per page, never a pass over the
// realms. A realm that stands alone, or a page with no file, has none.
import type { StoreRow } from "@gnoworld/core";
import type { Worlds } from "@gnoworld/schemas/indexer";
import { storeFor } from "../../lib/worldsStore.ts";

export interface Versions {
  /** This realm's version, `v2`: a `/v2` directory or a `_v2` suffix, else the first. */
  mine: string;
  /** The newest of the family, when it is another realm: its path and version. */
  newer: { path: string; version: string } | undefined;
  /** How many versions the file holds of the family. */
  count: number;
}

const versionOf = (path: string): string => /(?:[/_]|^)(v\d+)$/.exec(path)?.[1] ?? "v1";

// The rows by path and by family, indexed once per file: a page's lookups are then O(1).
const indexed = new WeakMap<Worlds["worlds"], { byPath: Map<string, StoreRow>; byFamily: Map<string, StoreRow[]> }>();

function indexOf(worlds: Worlds["worlds"]) {
  const held = indexed.get(worlds);
  if (held !== undefined) return held;
  const { rows } = storeFor(worlds);
  const byFamily = new Map<string, StoreRow[]>();
  for (const row of rows) byFamily.set(row.family, [...(byFamily.get(row.family) ?? []), row]);
  const made = { byPath: new Map(rows.map((row) => [row.path, row])), byFamily };
  indexed.set(worlds, made);
  return made;
}

/** The family of `realm` in the file, or none when it has one version or the file does not hold it. */
export function versionsOf(worlds: Worlds["worlds"], realm: string): Versions | undefined {
  const { byPath, byFamily } = indexOf(worlds);
  const mine = byPath.get(realm);
  if (mine === undefined) return undefined;
  const family = byFamily.get(mine.family) ?? [];
  const head = family.find((row) => row.head);
  if (family.length < 2 || head === undefined) return undefined;
  return {
    mine: versionOf(realm),
    newer: head.path === realm ? undefined : { path: head.path, version: versionOf(head.path) },
    count: family.length,
  };
}
