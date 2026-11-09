// Each realm's rollup (slice 13a), a pass of it after the worlds' file: the chain's calls above the height kept, read a page at a time
// (history.ts's walk), dated by their blocks' times (blockDays.ts), kept in the database (rollupStore.ts); then one file per realm of the
// worlds' file, named by its path's hash, shed to its gzip cap. A fault is logged by its kind and never undoes the worlds' pass.
import { blockTimes } from "@gnoworld/chain/asks";
import { rollupName } from "@gnoworld/core";
import { RealmRollup, ROLLUP_CAPS, ROLLUP_MAX_GZIP, type Worlds } from "@gnoworld/schemas/indexer";
import type { Log } from "@gnoworld/service/log";
import { mkdirSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { Blocks, daysOf, timesOf } from "./blockDays.ts";
import { readingOf, request, walkCalls, type Reader, type Reading } from "./history.ts";
import { Failure, kindOf, type Kind, type Send } from "./remote.ts";
import { rollupStore, type RollupStore } from "./rollupStore.ts";
import { replaceFiles } from "../replaceFile.ts";

/** The most heights of last calls a pass asks the exact time of, past those the days' bisection asked. */
const TIMES_PER_PASS = 1_000;

/** Every realm's importers: the realms of the file that import it (worlds.json's `imports` inverted), the most called first, then by path. */
export function importersOf(worlds: Worlds): Map<string, RealmRollup["importers"]> {
  const all = new Map<string, Map<string, number>>();
  for (const { path, imports, calls } of worlds.worlds.flatMap(({ realms }) => realms))
    for (const imported of imports.filter((each) => each !== path && each.startsWith("gno.land/r/")))
      all.set(imported, (all.get(imported) ?? new Map<string, number>()).set(path, calls ?? 0));
  const ranked = (by: Map<string, number>) =>
    [...by]
      .map(([path, calls]) => ({ path, calls }))
      .sort((a, b) => b.calls - a.calls || (a.path < b.path ? -1 : 1))
      .slice(0, ROLLUP_CAPS.importers);
  return new Map([...all].map(([path, by]) => [path, { total: by.size, top: ranked(by) }]));
}

// Whether the block the state was dated by still has its time: a chain restarted under the same name has none, or another.
async function anchorHolds(reading: Reading, anchor: { height: number; time: string }): Promise<boolean> {
  const answer = Blocks.safeParse(await request(reading, blockTimes([anchor.height])));
  if (!answer.success) throw new Failure("shape");
  const block = answer.data.data["b0"]?.[0];
  return block?.height === anchor.height && new Date(block.time).toISOString() === anchor.time;
}

/**
 * One read of the rollup: the calls to the realms `known` names (the worlds file's), above the height kept, each batch dated and kept in one
 * transaction, then the exact time of the last calls still without one. A fault ends it and keeps every batch before it.
 */
export async function readRollup(
  reader: Reader & { readonly page?: number },
  store: RollupStore,
  options: { known: ReadonlySet<string>; isStopped?: () => boolean },
): Promise<{ ok: true } | { ok: false; kind: Kind }> {
  const reading = readingOf(reader, options.isStopped);
  const ask = (heights: readonly number[]) => timesOf(reading, heights);
  try {
    const anchor = store.anchor();
    if (anchor !== undefined && !(await anchorHolds(reading, anchor))) store.reset();
    await walkCalls(reading, store.height(), async (rows, through) => {
      const mine = rows.map((row) => ({ ...row, calls: row.calls.filter(({ path }) => options.known.has(path)) }));
      const dated = await daysOf(
        mine.flatMap(({ height, calls }) => (calls.length > 0 ? [height] : [])),
        ask,
      );
      try {
        store.add(mine, dated, through);
      } catch (error) {
        throw error instanceof Failure ? error : new Failure("write");
      }
    });
    const untimed = store.untimed(TIMES_PER_PASS);
    if (untimed.length > 0) store.timed(await ask(untimed));
    return { ok: true };
  } catch (error) {
    return { ok: false, kind: kindOf(error) };
  }
}

/** Every realm's file of `worlds` with calls or importers, shed to its cap, in `folder` by its path's hash; false when none is written. */
export function writeRollups(folder: string, worlds: Worlds, store: RollupStore): { written: number } | false {
  const importers = importersOf(worlds);
  const files = worlds.worlds.flatMap(({ realms }) =>
    realms.flatMap(({ path }) => {
      const whole = store.rollupOf(path, importers.get(path), worlds.updated);
      const file = RealmRollup.safeParse(whole === undefined ? undefined : fitted(whole));
      return file.success
        ? [{ file: join(folder, `${rollupName(path)}.json`), text: `${JSON.stringify(file.data)}\n` }]
        : [];
    }),
  );
  try {
    mkdirSync(folder, { recursive: true });
  } catch {
    return false;
  }
  return replaceFiles(files) ? { written: files.length } : false;
}

/** What a pass of the rollup reads and writes with: its settings (none: no rollup), the job's way out, its pace and its stop. */
export interface RollupPass {
  readonly rollup?: { readonly db: DatabaseSync; readonly dir: string } | undefined;
  readonly log: Log;
  readonly send: Send;
  readonly universe: { readonly id: string; readonly indexer: string };
  readonly pace: () => Promise<void>;
  readonly historyPage?: number | undefined;
  readonly isStopped: () => boolean;
}

/** A pass of the rollup over the worlds' file just written; a stop writes no file. */
export async function rollUp(pass: RollupPass, worlds: Worlds): Promise<void> {
  const { rollup, log, universe, isStopped } = pass;
  if (rollup === undefined) return;
  const failed = (kind: Kind): void => {
    log("worlds_rollup_failed", { error: kind });
  };
  let store: RollupStore;
  try {
    store = rollupStore(rollup.db, universe.id);
  } catch {
    failed("write");
    return;
  }
  const page = pass.historyPage === undefined ? {} : { page: pass.historyPage };
  const reader = { send: pass.send, indexer: universe.indexer, pace: pass.pace, ...page };
  const known = new Set(worlds.worlds.flatMap(({ realms }) => realms.map(({ path }) => path)));
  const read = await readRollup(reader, store, { known, isStopped });
  if (!read.ok) failed(read.kind);
  if (!isStopped() && writeRollups(rollup.dir, worlds, store) === false) failed("write");
}

const gzipped = (file: RealmRollup): number => gzipSync(JSON.stringify(file), { level: 6 }).length;
const half = (length: number) => Math.floor(length / 2);

// The file with one list halved, in shedding's order: the last calls, the importers, the functions, then the days, the oldest going.
function shed(file: RealmRollup): RealmRollup | undefined {
  if (file.last.length > 0) return { ...file, last: file.last.slice(0, half(file.last.length)) };
  const { importers } = file;
  if (importers.top.length > 0)
    return { ...file, importers: { ...importers, top: importers.top.slice(0, half(importers.top.length)) } };
  if (file.functions.length > 0) return { ...file, functions: file.functions.slice(0, half(file.functions.length)) };
  if (file.days.length > 0) return { ...file, days: file.days.slice(file.days.length - half(file.days.length)) };
  return undefined;
}

/** The file shed to `maxGzip` once gzipped as nginx sends it (level 6); none when nothing is left to shed. */
export function fitted(whole: RealmRollup, maxGzip = ROLLUP_MAX_GZIP): RealmRollup | undefined {
  let file: RealmRollup | undefined = whole;
  while (file !== undefined && gzipped(file) > maxGzip) file = shed(file);
  return file;
}
