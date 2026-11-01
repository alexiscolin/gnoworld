// The worlds job (slice 7, 7c; plan §3 "The server's new reads"): every half hour it reads a universe's realm list, groups the
// realms into worlds, finds new families and batches by comparing with the last list, reads each package once (deployer, functions,
// imports), asks the indexer for each realm's calls and the chain for each deployer's name, and writes worlds.json beside and
// renamed over. One call at a time, a pause between calls, every answer capped and parsed. A fault of the list keeps the last
// file; a silent indexer leaves a world at rest (null counts) and the rest of the file whole. Nothing a chain or an indexer wrote
// reaches a log: a fault is logged by its kind. The file keeps every realm it has seen, for a chain only adds realms.
import { Worlds, WORLDS_MAX_BYTES } from "@gnoworld/schemas";
import { readFileSync } from "node:fs";
import type { Log } from "../log.ts";
import { send as netSend, publicUrl } from "../net.ts";
import { repeat } from "../repeat.ts";
import { replaceFile } from "../replaceFile.ts";
import { knownFacts, namesOf, worldsOf, type Gathered } from "./assemble.ts";
import { compareLists, sorted } from "./compare.ts";
import { readHistory, type History } from "./history.ts";
import { readRealmPaths } from "./list.ts";
import { readNames } from "./names.ts";
import { readPackages } from "./packages.ts";
import { Failure, kindOf, pacer, type Kind, type Send } from "./remote.ts";

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
  isStopped?: () => boolean;
}

export type Outcome = { wrote: true } | { wrote: false; kind: Kind };

export const EVERY_MS = 30 * 60_000;
export const PAUSE_MS = 250;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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

// The history of each realm in turn. A fault of the network ends the asking for the pass; one that is about a realm only
// (an answer too big or of the wrong shape) leaves that realm with its earlier counts.
async function readHistories(
  reader: { send: Send; indexer: string; pace: () => Promise<void> },
  paths: readonly string[],
  hooks: { log: Log; isStopped: () => boolean },
): Promise<Map<string, History>> {
  const histories = new Map<string, History>();
  let skipped: Kind | undefined;
  for (const path of paths) {
    if (hooks.isStopped()) throw new Failure("stopped");
    const read = await readHistory(reader, path);
    if (read.ok) {
      histories.set(path, read.history);
    } else if (read.kind === "shape" || read.kind === "too_large") {
      skipped ??= read.kind;
    } else {
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
  const last = loadLast(settings.file, universe.id);
  const lastWorlds = new Map(last?.worlds.map((world) => [world.id, world] as const));
  const lastRealms = new Map(
    last?.worlds.flatMap((world) => world.realms.map((realm) => [realm.path, realm] as const)),
  );
  if (list.paths.length === 0 && lastRealms.size > 0) return "empty";
  const paths = sorted(new Set([...list.paths, ...lastRealms.keys()]));
  if (isStopped()) return "stopped";
  const facts = await readPackages({ send, rpc: universe.rpc, known: knownFacts(lastRealms), pace }, paths);
  const earlierNames = namesOf(lastRealms);
  const unnamed = [...facts.values()].flatMap(({ deployer }) =>
    deployer === null || earlierNames.has(deployer) ? [] : [deployer],
  );
  const names = await readNames({ send, rpc: universe.rpc, pace }, unnamed);
  const reader = { send, indexer: universe.indexer, pace };
  const histories = await readHistories(reader, paths, settings);
  const news = compareLists([...lastRealms.keys()], list.paths);
  return { lastWorlds, lastRealms, paths, news, facts, earlierNames, names, histories };
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
    const file = Worlds.safeParse({
      version: 1,
      universe: settings.universe.id,
      updated: stamp,
      worlds: worldsOf(read, stamp),
    });
    if (!file.success) return fail("shape");
    const text = `${JSON.stringify(file.data)}\n`;
    if (Buffer.byteLength(text, "utf8") > settings.maxBytes) return fail("too_large");
    return replaceFile(settings.file, text) ? { wrote: true } : fail("write");
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
