// Putting a pass's reads together (slice 7, 7c): what was read, the last file it builds on, and the rows of the new file. A fact
// this pass could not read is the last file's, else nothing (null, or an empty list), never a zero.
import type { Worlds } from "@gnoworld/schemas";
import type { Comparison } from "./compare.ts";
import { groupWorlds } from "./group.ts";
import type { History } from "./history.ts";
import type { PackageFacts } from "./packages.ts";

type RealmRow = Worlds["worlds"][number]["realms"][number];
type WorldRow = Worlds["worlds"][number];

// What a pass read, and the last file it builds on.
export interface Gathered {
  readonly lastWorlds: ReadonlyMap<string, WorldRow>;
  readonly lastRealms: ReadonlyMap<string, RealmRow>;
  readonly paths: string[];
  readonly news: Comparison;
  readonly facts: ReadonlyMap<string, PackageFacts>;
  readonly earlierNames: ReadonlyMap<string, string>;
  readonly names: ReadonlyMap<string, string | null>;
  readonly histories: ReadonlyMap<string, History>;
}

// The facts of the realms the last file already read: a realm with no deployer, function and import was not read.
export function knownFacts(lastRealms: ReadonlyMap<string, RealmRow>): Map<string, PackageFacts> {
  const known = new Map<string, PackageFacts>();
  for (const [path, { deployer, functions, imports }] of lastRealms) {
    if (deployer !== null || functions.length > 0 || imports.length > 0)
      known.set(path, { deployer, functions, imports });
  }
  return known;
}

export function namesOf(lastRealms: ReadonlyMap<string, RealmRow>): Map<string, string> {
  const names = new Map<string, string>();
  for (const { deployer, deployerName } of lastRealms.values()) {
    if (deployer !== null && deployerName !== null) names.set(deployer, deployerName);
  }
  return names;
}

// A realm's counts: this pass's, else the last file's, else not read.
function countsOf(
  history: History | undefined,
  earlier: RealmRow | undefined,
): Pick<RealmRow, "calls" | "callers" | "lastHeight"> {
  if (history !== undefined) return history;
  return { calls: earlier?.calls ?? null, callers: earlier?.callers ?? null, lastHeight: earlier?.lastHeight ?? null };
}

// One realm's row: what this pass read, else what the last file had, else nothing.
function rowOf(path: string, read: Gathered): RealmRow {
  const facts = read.facts.get(path);
  const deployer = facts?.deployer ?? null;
  const name = deployer === null ? undefined : (read.names.get(deployer) ?? read.earlierNames.get(deployer));
  return {
    path,
    deployer,
    deployerName: name ?? null,
    functions: facts?.functions ?? [],
    imports: facts?.imports ?? [],
    ...countsOf(read.histories.get(path), read.lastRealms.get(path)),
  };
}

// The worlds of every path known, a new world stamped with the time and flagged when its namespace came in a batch.
export function worldsOf(read: Gathered, stamp: string): WorldRow[] {
  const fresh = new Set(read.news.newWorlds);
  const batched = new Set(read.news.batches.map(({ namespace }) => namespace));
  return groupWorlds(read.paths).map(({ id, namespace, realms }) => {
    const before = read.lastWorlds.get(id);
    const seen = before?.seen ?? (fresh.has(id) ? stamp : undefined);
    const batch = before?.batch ?? (fresh.has(id) && batched.has(namespace) ? true : undefined);
    return {
      id,
      namespace,
      realms: realms.map((path) => rowOf(path, read)),
      ...(seen === undefined ? {} : { seen }),
      ...(batch === undefined ? {} : { batch }),
    };
  });
}
