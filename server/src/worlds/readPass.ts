// The worlds pass's reading half: the list, the packages, the names and each realm's history, in that order, with the last file as the
// memory of what was already known.
import { Worlds } from "@gnoworld/schemas/indexer";
import { readFileSync } from "node:fs";
import type { Log } from "@gnoworld/service/log";
import { knownFacts, namesOf, sinceOf, type Gathered } from "./assemble.ts";
import { compareLists, sorted } from "./compare.ts";
import { keptPaths, isSystem } from "./group.ts";
import { readHistories, type StampedHistory } from "./history.ts";
import { readRealmPaths } from "./list.ts";
import { readNames } from "./names.ts";
import { readPackages } from "./packages.ts";
import { pacer, type Kind, type Send } from "./remote.ts";

export interface Universe {
  readonly id: string;
  readonly rpc: string;
  readonly indexer: string;
}

/** What the reading half needs of a pass's settings. */
export interface ReadSettings {
  readonly file: string;
  readonly log: Log;
  readonly send: Send;
  readonly universe: Universe;
  readonly now: () => number;
  readonly wait: (ms: number) => Promise<void>;
  readonly pauseMs: number;
  readonly historyPage?: number;
  readonly isStopped: () => boolean;
}

// The last file, or none when it is not there, is no good file, or is another universe's.
function loadLast(file: string, universe: string): Worlds | undefined {
  try {
    const parsed = Worlds.safeParse(JSON.parse(readFileSync(file, "utf8")));
    return parsed.success && parsed.data.universe === universe ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

// Every realm's history from the indexer, each stamped once the read has ended; none when it failed, each realm keeping its last counts.
async function readCalls(
  settings: ReadSettings,
  read: { pace: () => Promise<void>; paths: readonly string[]; sinceOf: (path: string) => number | undefined },
): Promise<Map<string, StampedHistory> | "stopped"> {
  const { send, universe, isStopped, log } = settings;
  const page = settings.historyPage === undefined ? {} : { page: settings.historyPage };
  const calls = await readHistories({ send, indexer: universe.indexer, pace: read.pace, ...page }, read.paths, {
    sinceOf: read.sinceOf,
    isStopped,
  });
  if (!calls.ok) {
    if (calls.kind === "stopped") return "stopped";
    log("worlds_indexer_failed", { error: calls.kind });
    return new Map();
  }
  if (calls.skipped > 0) log("worlds_history_skipped", { error: "shape" });
  const at = settings.now();
  return new Map([...calls.histories].map(([path, history]) => [path, { ...history, at }]));
}

// The list, the packages, the names and the histories, in that order, or the kind of fault that ends the pass.
export async function gather(settings: ReadSettings): Promise<Gathered | Kind> {
  const { send, universe, isStopped } = settings;
  const pace = pacer(settings.wait, settings.pauseMs, settings.now);
  const list = await readRealmPaths({ send, rpc: universe.rpc, pace });
  if (!list.ok) return list.kind;
  if (list.partial === true) settings.log("worlds_shed", { error: "list" });
  const last = loadLast(settings.file, universe.id);
  const lastWorlds = new Map(last?.worlds.map((world) => [world.id, world] as const));
  const lastRealms = new Map(
    last?.worlds.flatMap((world) => world.realms.map((realm) => [realm.path, realm] as const)),
  );
  if (list.paths.length === 0 && lastRealms.size > 0) return "empty";
  const known = sorted(new Set([...list.paths, ...lastRealms.keys()].filter((path) => !isSystem(path))));
  const paths = sorted(new Set(keptPaths(known)));
  if (paths.length < known.length) settings.log("worlds_shed", { error: "realms" });
  if (isStopped()) return "stopped";
  const knownBefore = knownFacts(lastRealms, lastWorlds);
  const facts = await readPackages({ send, rpc: universe.rpc, known: knownBefore, pace }, paths);
  const fresh = new Set([...facts.keys()].filter((path) => !knownBefore.has(path)));
  const earlierNames = namesOf(lastRealms);
  const unnamed = [...facts.values()].flatMap(({ deployer }) =>
    deployer === null || earlierNames.has(deployer) ? [] : [deployer],
  );
  const names = await readNames({ send, rpc: universe.rpc, pace }, unnamed);
  const histories = await readCalls(settings, { pace, paths, sinceOf: sinceOf(lastRealms) });
  if (histories === "stopped") return "stopped";
  const news = compareLists([...lastRealms.keys()], list.paths);
  return { lastWorlds, lastRealms, paths, news, facts, fresh, earlierNames, names, histories };
}
