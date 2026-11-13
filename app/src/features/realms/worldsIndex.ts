// The worlds' file indexed once per file: the names it holds for addresses (a deployer's), its realms flat and by path, and how many import
// each; for a realm's plate (routes/plate) and its explorer card, which both read it.
import { shortAddress } from "@gnoworld/schemas";
import type { Worlds } from "@gnoworld/schemas/indexer";

const named = new WeakMap<Worlds["worlds"], Map<string, string>>();

function namesOf(worlds: Worlds["worlds"]): Map<string, string> {
  const kept = named.get(worlds);
  if (kept !== undefined) return kept;
  const names = new Map<string, string>();
  for (const { realms } of worlds) {
    for (const { deployer, deployerName } of realms) {
      if (deployer !== null && deployerName !== null) names.set(deployer, deployerName);
    }
  }
  named.set(worlds, names);
  return names;
}

/** A deployer as a name when the file has one, else the short address. */
export const deployerLabel = (name: string | null | undefined, address: string): string =>
  name ?? shortAddress(address);

/** An address as the file names it, else short. */
export const callerName = (worlds: Worlds["worlds"] | undefined, address: string | null): string =>
  address === null
    ? "Unknown"
    : deployerLabel(worlds === undefined ? undefined : namesOf(worlds).get(address), address);

type Held = Worlds["worlds"][number]["realms"][number];
interface Index {
  all: Held[];
  byPath: Map<string, Held>;
  importers: Map<string, number>;
}
const indexed = new WeakMap<Worlds["worlds"], Index>();

function indexOf(worlds: Worlds["worlds"]): Index {
  const kept = indexed.get(worlds);
  if (kept !== undefined) return kept;
  const index: Index = { all: worlds.flatMap((world) => world.realms), byPath: new Map(), importers: new Map() };
  for (const each of index.all) {
    if (!index.byPath.has(each.path)) index.byPath.set(each.path, each);
    for (const path of new Set(each.imports)) index.importers.set(path, (index.importers.get(path) ?? 0) + 1);
  }
  indexed.set(worlds, index);
  return index;
}

/** The file's realms, flattened once per file. */
export const realmsOf = (worlds: Worlds["worlds"]): Held[] => indexOf(worlds).all;

/** The realm the file holds at a path. */
export const heldOf = (worlds: Worlds["worlds"], path: string): Held | undefined => indexOf(worlds).byPath.get(path);

/** How many realms of the file import a path. */
export const importersOf = (worlds: Worlds["worlds"], path: string): number => indexOf(worlds).importers.get(path) ?? 0;
