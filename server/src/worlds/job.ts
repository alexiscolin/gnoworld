// The worlds job (slice 7, 7c; plan §3 "The server's new reads"): every half hour it reads a universe's realm list, groups the realms into
// worlds, finds new families and batches by comparing with the last list, reads each package once (deployer, functions, imports), the chain
// for each deployer's name and its indexer for every call (7k3), and writes worlds.json and its count (7n2) beside and renamed over. One
// call at a time, each started a pause after the last, every answer capped and parsed. A fault of the list keeps the last files; a silent
// indexer leaves a world at rest (its last counts). Nothing a chain or an indexer wrote reaches a log: a fault is logged by its kind.
import { worldsDrawn } from "@gnoworld/core";
import type { WorldsCount } from "@gnoworld/schemas";
import { Worlds, WORLDS_MAX_BYTES } from "@gnoworld/schemas/indexer";
import { readFileSync } from "node:fs";
import type { Log } from "@gnoworld/service/log";
import { send as netSend, publicUrl } from "@gnoworld/service/net";
import { repeat, waitsAfterOutcome, type Outcome } from "../repeat.ts";
import { besideOf, replaceFiles } from "../replaceFile.ts";
import { knownFacts, namesOf, sinceOf, worldsOf, type Gathered } from "./assemble.ts";
import { compareLists, sorted } from "./compare.ts";
import { isSystem, keptPaths } from "./group.ts";
import { readHistories, type StampedHistory } from "./history.ts";
import { readRealmPaths } from "./list.ts";
import { readNames } from "./names.ts";
import { readPackages } from "./packages.ts";
import { kindOf, pacer, type Kind, type Send } from "./remote.ts";
import { fitted } from "./shed.ts";
import { habitsAt, makeTrends, type ChainRead } from "./chainTrends.ts";
import { setTimeout as sleep } from "node:timers/promises";

interface Universe {
  readonly id: string;
  readonly rpc: string;
  readonly indexer: string;
}

export interface RunOptions {
  file: string;
  log: Log;
  send?: Send;
  universe: Universe;
  now?: () => number;
  /** Waits `ms` between two calls. */
  wait?: (ms: number) => Promise<void>;
  /** The least time between the starts of two calls of a pass. */
  pauseMs?: number;
  maxBytes?: number;
  /** The transactions a page of the indexer's read asks, history.ts's unless a test says less. */
  historyPage?: number;
  isStopped?: () => boolean;
  /** Told each pass that wrote its files: the file, and the histories this pass read (7t's trends). */
  trends?: { passed: (worlds: Worlds, read: ReadonlyMap<string, StampedHistory>) => void };
}

export const EVERY_MS = 30 * 60_000;
export const PAUSE_MS = 250;

// The options with their defaults, so the pass reads them as plain values.
interface Settings {
  readonly file: string;
  readonly log: Log;
  readonly send: Send;
  readonly universe: Universe;
  readonly now: () => number;
  readonly wait: (ms: number) => Promise<void>;
  readonly pauseMs: number;
  readonly maxBytes: number;
  readonly historyPage?: number;
  readonly isStopped: () => boolean;
  readonly trends?: RunOptions["trends"];
}

function settingsOf(options: RunOptions): Settings {
  return {
    ...options,
    send: options.send ?? netSend,
    now: options.now ?? Date.now,
    wait: options.wait ?? sleep,
    pauseMs: options.pauseMs ?? PAUSE_MS,
    maxBytes: options.maxBytes ?? WORLDS_MAX_BYTES,
    isStopped: options.isStopped ?? (() => false),
  };
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
  settings: Settings,
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
async function gather(settings: Settings): Promise<Gathered | Kind> {
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

/** One pass. It never throws for a fault of the chain, the indexer or the disk: it says its kind and logs it. */
export async function runWorlds(options: RunOptions): Promise<Outcome> {
  const settings = settingsOf(options);
  const start = settings.now();
  const fail = (kind: Kind): Outcome => {
    settings.log("worlds_failed", { error: kind });
    return { wrote: false, kind };
  };
  try {
    const read = await gather(settings);
    if (typeof read === "string") return fail(read);
    if (settings.isStopped()) return fail("stopped");
    const stamp = new Date(settings.now()).toISOString();
    const head = { version: 1, universe: settings.universe.id, updated: stamp } as const;
    const worlds = fitted(head, worldsOf(read, stamp), settings.maxBytes);
    if (worlds === null) return fail("too_large");
    if (worlds.stripped > 0) settings.log("worlds_shed", { error: "lists" });
    if (worlds.dropped > 0) settings.log("worlds_shed", { error: "worlds" });
    const file = Worlds.safeParse({ ...head, worlds: worlds.worlds });
    if (!file.success) return fail("shape");
    // The count of the file as written, as the scene counts it: the hero and the cosmos never say two numbers; beside it, worlds-count.json,
    // the name nginx serves.
    const count: WorldsCount = { ...head, count: worldsDrawn(file.data.worlds) };
    const written = replaceFiles([
      { file: settings.file, text: `${JSON.stringify(file.data)}\n` },
      { file: besideOf(settings.file, "count"), text: `${JSON.stringify(count)}\n` },
    ]);
    if (!written) return fail("write");
    settings.log("worlds_written", { ms: settings.now() - start });
    settings.trends?.passed(file.data, read.histories);
    return { wrote: true };
  } catch (error) {
    return fail(kindOf(error));
  }
}

export interface WorldsJob {
  stop: () => void;
  /** The chain's part of the trends, each pass against the one before (7t). */
  trends: () => ChainRead;
}

// The universe's addresses, or a refusal at start: https on a public name, no user, and an id that is a plain slug.
function checked(universe: Universe): void {
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(universe.id)) throw new RangeError("worlds: the universe id is no plain name");
  if (publicUrl(universe.rpc) === null) throw new RangeError("worlds: the rpc is no public https address");
  if (publicUrl(universe.indexer) === null) throw new RangeError("worlds: the indexer is no public https address");
}

/** Runs a pass at start and after each pass ends, one at a time, `everyMs` apart; `stop` ends it, and a pass under way writes nothing. Each
 * world's window is kept in `habits`' files (7t3), counts alone; without them the chain's signals have no habit. */
export function startWorlds(
  options: RunOptions & { everyMs?: number; habits?: { transactions: string; addresses: string } },
): WorldsJob {
  checked(options.universe);
  const everyMs = options.everyMs ?? EVERY_MS;
  const habits = options.habits === undefined ? {} : { habits: habitsAt(options.habits, options.now ?? Date.now) };
  const trends = makeTrends({ ...habits, log: options.log });
  const job = repeat({
    pass: (isStopped) => runWorlds({ ...options, isStopped, trends }),
    failed: () => {
      options.log("worlds_failed", { error: "internal" });
    },
    waitMs: waitsAfterOutcome(everyMs),
  });
  return {
    stop() {
      job.stop();
      trends.save();
    },
    trends: trends.chain,
  };
}
