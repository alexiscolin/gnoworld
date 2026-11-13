// The worlds job (slice 7, 7c; plan §3 "The server's new reads"): every half hour it reads a universe's realm list, groups the realms into
// worlds, finds new families and batches by comparing with the last list, reads each package once (deployer, functions, imports), the chain
// for each deployer's name and its indexer for every call (7k3), and writes worlds.json and its count (7n2) beside and renamed over. One
// call at a time, each started a pause after the last, every answer capped and parsed. A fault of the list keeps the last files; a silent
// indexer leaves a world at rest (its last counts). Nothing a chain or an indexer wrote reaches a log: a fault is logged by its kind.
import { worldsDrawn } from "@gnoworld/core";
import type { WorldsCount } from "@gnoworld/schemas";
import { Worlds, WORLDS_MAX_BYTES, type NetworkAnswer, type Trending } from "@gnoworld/schemas/indexer";
import type { DatabaseSync } from "node:sqlite";
import type { Log } from "@gnoworld/service/log";
import { send as netSend, publicUrl } from "@gnoworld/service/net";
import { repeat, waitsAfterOutcome, type Outcome } from "../repeat.ts";
import { besideOf, replaceFiles } from "../replaceFile.ts";
import { worldsOf } from "./assemble.ts";
import { runNetwork } from "./network.ts";
import { rollUp } from "./rollup.ts";
import type { TokenStore } from "./tokenStore.ts";
import { gather, type Universe } from "./readPass.ts";
import { kindOf, pacer, type Kind, type Send } from "./remote.ts";
import { fitted } from "./shed.ts";
import { setTimeout as sleep } from "node:timers/promises";

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
  /** Each realm's rollup (13a): its state's database and the folder of its files; none without it. */
  rollup?: { db: DatabaseSync; dir: string };
  /** The token store the server's route reads too, so a reset of a pass clears the route's answers; none: each pass makes its own. */
  tokens?: TokenStore;
  /** Told each pass the ranking of the last 7 days, once the rollup's files are written. */
  trending?: (trending: Trending) => void;
  /** The network's line of health: its tables' database, and told each pass its answer; none without it. */
  network?: { db: DatabaseSync; told: (answer: NetworkAnswer) => void };
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
  readonly rollup?: RunOptions["rollup"];
  readonly tokens?: RunOptions["tokens"];
  readonly trending?: RunOptions["trending"];
  readonly network?: RunOptions["network"];
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

// What follows a pass that wrote its files: each realm's rollup, then the network's line.
async function passed(settings: Settings, worlds: Worlds): Promise<void> {
  await rollUp({ ...settings, pace: pacer(settings.wait, settings.pauseMs, settings.now) }, worlds);
  await runNetwork(settings);
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
    await passed(settings, file.data);
    return { wrote: true };
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
  const job = repeat({
    pass: (isStopped) => runWorlds({ ...options, isStopped }),
    failed: () => {
      options.log("worlds_failed", { error: "internal" });
    },
    waitMs: waitsAfterOutcome(everyMs),
  });
  return {
    stop() {
      job.stop();
    },
  };
}
