// The worlds job (slice 7, 7c; plan §3 "The server's new reads"): every half hour it reads a universe's realm list, groups the realms into
// worlds, finds new families and batches by comparing with the last list, reads each package once (deployer, functions, imports), asks the
// indexer for each realm's calls and the chain for each deployer's name, and writes worlds.json and its count (7n2) beside and renamed over.
// One call at a time, a pause between calls, every answer capped and parsed. A fault of the list keeps the last files; a silent indexer leaves
// a world at rest (null counts). Nothing a chain or an indexer wrote reaches a log: a fault is logged by its kind. The file keeps every realm.
import { worldsDrawn } from "@gnoworld/core";
import type { WorldsCount } from "@gnoworld/schemas";
import { Worlds, WORLDS_MAX_BYTES } from "@gnoworld/schemas/indexer";
import { readFileSync } from "node:fs";
import type { Log } from "../log.ts";
import { send as netSend, publicUrl } from "../net.ts";
import { repeat } from "../repeat.ts";
import { replaceFiles } from "../replaceFile.ts";
import { knownFacts, namesOf, worldsOf, type Gathered } from "./assemble.ts";
import { compareLists, sorted } from "./compare.ts";
import { keptPaths } from "./group.ts";
import { HISTORY_MAX_CALLS, readHistory, realmsOfPass, type History } from "./history.ts";
import { readRealmPaths } from "./list.ts";
import { readNames } from "./names.ts";
import { readPackages } from "./packages.ts";
import { Failure, kindOf, pacer, type Kind, type Send } from "./remote.ts";
import { fitted } from "./shed.ts";

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
  /** The pause between two calls of a pass. */
  pauseMs?: number;
  maxBytes?: number;
  /** The most realms asked of the indexer in one pass. */
  historyMax?: number;
  isStopped?: () => boolean;
}

export type Outcome = { wrote: true } | { wrote: false; kind: Kind };

export const EVERY_MS = 30 * 60_000;
export const PAUSE_MS = 250;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// The worlds' count beside their file, named after it (worlds.json, worlds-count.json: the name nginx serves), so the two never share a path.
const countFileOf = (file: string): string => `${file.replace(/\.json$/, "")}-count.json`;

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
  readonly historyMax: number;
  readonly isStopped: () => boolean;
}

function settingsOf(options: RunOptions): Settings {
  return {
    ...options,
    send: options.send ?? netSend,
    now: options.now ?? Date.now,
    wait: options.wait ?? sleep,
    pauseMs: options.pauseMs ?? PAUSE_MS,
    maxBytes: options.maxBytes ?? WORLDS_MAX_BYTES,
    historyMax: options.historyMax ?? HISTORY_MAX_CALLS,
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

/** The answers of the wrong shape in a row that end the asking: the indexer does not speak the schema we ask in. */
const SHAPE_STRIKES = 3;

// Whether a fault is about one realm's answer (too big, or of the wrong shape) and not about the indexer or the network.
const aboutRealm = (kind: Kind): boolean => kind === "shape" || kind === "too_large";

// The history of each realm in turn; a network fault, or SHAPE_STRIKES wrong-shape answers in a row, ends the asking. ponytail: one
// request per realm, at most HISTORY_MAX_CALLS a pass (about 3 minutes at 743 realms, 42 at the cap, past the cycle: repeat.ts waits
// for the pass); a realm not asked or at fault keeps its earlier counts. A chain-wide read waits for the schema.
async function readHistories(
  reader: { send: Send; indexer: string; pace: () => Promise<void> },
  paths: readonly string[],
  hooks: { log: Log; isStopped: () => boolean },
): Promise<Map<string, History>> {
  const histories = new Map<string, History>();
  let skipped: Kind | undefined;
  let strikes = 0;
  for (const path of paths) {
    if (hooks.isStopped()) throw new Failure("stopped");
    const read = await readHistory(reader, path);
    if (read.ok) {
      histories.set(path, read.history);
      strikes = 0;
      continue;
    }
    strikes = read.kind === "shape" ? strikes + 1 : 0;
    if (aboutRealm(read.kind)) skipped ??= read.kind;
    if (!aboutRealm(read.kind) || strikes >= SHAPE_STRIKES) {
      hooks.log("worlds_indexer_failed", { error: read.kind });
      break;
    }
  }
  if (skipped !== undefined) hooks.log("worlds_history_skipped", { error: skipped });
  return histories;
}

// The list, the packages, the names and the histories, in that order, or the kind of fault that ends the pass.
async function gather(settings: Settings): Promise<Gathered | Kind> {
  const { send, universe, isStopped } = settings;
  const pace = pacer(settings.wait, settings.pauseMs);
  const list = await readRealmPaths({ send, rpc: universe.rpc, pace });
  if (!list.ok) return list.kind;
  if (list.partial === true) settings.log("worlds_shed", { error: "list" });
  const last = loadLast(settings.file, universe.id);
  const lastWorlds = new Map(last?.worlds.map((world) => [world.id, world] as const));
  const lastRealms = new Map(
    last?.worlds.flatMap((world) => world.realms.map((realm) => [realm.path, realm] as const)),
  );
  if (list.paths.length === 0 && lastRealms.size > 0) return "empty";
  const known = sorted(new Set([...list.paths, ...lastRealms.keys()]));
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
  const reader = { send, indexer: universe.indexer, pace };
  const asked = realmsOfPass(paths, Math.floor(settings.now() / EVERY_MS), settings.historyMax);
  const histories = await readHistories(reader, asked, settings);
  const news = compareLists([...lastRealms.keys()], list.paths);
  return { lastWorlds, lastRealms, paths, news, facts, fresh, earlierNames, names, histories };
}

/** One pass. It never throws for a fault of the chain, the indexer or the disk: it says its kind and logs it. */
export async function runWorlds(options: RunOptions): Promise<Outcome> {
  const settings = settingsOf(options);
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
    // The count of the file as written, as the scene counts it: the hero and the cosmos never say two numbers.
    const count: WorldsCount = { ...head, count: worldsDrawn(file.data.worlds) };
    const written = replaceFiles([
      { file: settings.file, text: `${JSON.stringify(file.data)}\n` },
      { file: countFileOf(settings.file), text: `${JSON.stringify(count)}\n` },
    ]);
    return written ? { wrote: true } : fail("write");
  } catch (error) {
    return fail(kindOf(error));
  }
}

export interface WorldsJob {
  stop: () => void;
}

// The universe's addresses, or a refusal at start: https on a public name, no user, and an id that is a plain slug.
function checked(universe: Universe): void {
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(universe.id)) throw new RangeError("worlds: the universe id is no plain name");
  if (publicUrl(universe.rpc) === null) throw new RangeError("worlds: the rpc is no public https address");
  if (publicUrl(universe.indexer) === null) throw new RangeError("worlds: the indexer is no public https address");
}

/** Runs a pass at start and after each pass ends, one at a time, `everyMs` apart; `stop` ends it, and a pass under way writes nothing. */
export function startWorlds(options: RunOptions & { everyMs?: number }): WorldsJob {
  checked(options.universe);
  const everyMs = options.everyMs ?? EVERY_MS;
  return repeat({
    pass: (isStopped) => runWorlds({ ...options, isStopped }),
    failed: () => {
      options.log("worlds_failed", { error: "internal" });
    },
    waitMs: () => everyMs,
  });
}
