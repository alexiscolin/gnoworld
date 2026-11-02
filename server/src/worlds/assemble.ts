// Putting a pass's reads together (slice 7, 7c): what was read, the last file it builds on, and the rows of the new file. A fact
// this pass could not read is the last file's, else nothing (null, or an empty list), never a zero.
import { natureOf } from "@gnoworld/core";
import type { Worlds } from "@gnoworld/schemas/indexer";
import type { Comparison } from "./compare.ts";
import { groupWorlds, type Group } from "./group.ts";
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
  /** The realms this pass read, beside those the last file knew. */
  readonly fresh: ReadonlySet<string>;
  readonly earlierNames: ReadonlyMap<string, string>;
  readonly names: ReadonlyMap<string, string | null>;
  readonly histories: ReadonlyMap<string, History>;
}

// The facts of the realms the last file already read: a realm with no deployer, function and import was not read, and nor, while its
// world has no nature yet, was one with no name, whose lists the file may have shed (F4109): it is read again, once.
export function knownFacts(
  lastRealms: ReadonlyMap<string, RealmRow>,
  lastWorlds: ReadonlyMap<string, WorldRow>,
): Map<string, PackageFacts> {
  const waiting = new Set(
    [...lastWorlds.values()].flatMap(({ nature, realms }) =>
      nature === undefined ? realms.map(({ path }) => path) : [],
    ),
  );
  const known = new Map<string, PackageFacts>();
  for (const [path, { deployer, functions, imports }] of lastRealms) {
    const named = functions.length > 0 || imports.length > 0;
    if (named || (deployer !== null && !waiting.has(path))) known.set(path, { deployer, functions, imports });
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

// A world's nature (F4109): the last file's, else read from its realms' own names once every one was read this pass or is known with
// names, before the file is shed; a known realm with none may be one whose lists were shed, and knownFacts has it read again. Kept once
// read, so a flood that sheds lists and a new realm move no class; a world the file dropped whole reads its nature anew when it returns.
function natureFor(before: WorldRow | undefined, rows: readonly RealmRow[], read: Gathered): WorldRow["nature"] {
  if (before?.nature !== undefined) return before.nature;
  const named = rows.every(({ path }) => {
    const facts = read.facts.get(path);
    return facts !== undefined && (read.fresh.has(path) || facts.functions.length + facts.imports.length > 0);
  });
  return named ? natureOf(rows) : undefined;
}

interface Pass {
  readonly fresh: ReadonlySet<string>;
  readonly batched: ReadonlySet<string>;
  readonly stamp: string;
}

// A world's first-seen time and batch flag: the last file's, else this pass's for a new world.
function marksOf(before: WorldRow | undefined, { id, namespace }: Group, pass: Pass): Pick<WorldRow, "seen" | "batch"> {
  const seen = before?.seen ?? (pass.fresh.has(id) ? pass.stamp : undefined);
  const batch = before?.batch ?? (pass.fresh.has(id) && pass.batched.has(namespace) ? true : undefined);
  return { ...(seen === undefined ? {} : { seen }), ...(batch === undefined ? {} : { batch }) };
}

// The worlds of every path known, a new world stamped with the time and flagged when its namespace came in a batch.
export function worldsOf(read: Gathered, stamp: string): WorldRow[] {
  const fresh = new Set(read.news.newWorlds);
  const batched = new Set(read.news.batches.map(({ namespace }) => namespace));
  return groupWorlds(read.paths).map((group) => {
    const before = read.lastWorlds.get(group.id);
    const rows = group.realms.map((path) => rowOf(path, read));
    const nature = natureFor(before, rows, read);
    return {
      id: group.id,
      namespace: group.namespace,
      realms: rows,
      ...marksOf(before, group, { fresh, batched, stamp }),
      ...(nature === undefined ? {} : { nature }),
    };
  });
}
