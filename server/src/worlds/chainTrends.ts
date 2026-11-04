// The chain's part of the ticker's trends (slice 7, 7t, 7t3): each world's window between the worlds job's last two passes (the transactions
// to its realms, the different addresses that sent them) beside its usual window of 14 days, kept in its habits; and the world the chain's
// list first showed in the last day. Only from what was read: a realm either pass left unread counts nothing, a world with none is unknown,
// never zero; a world with no name or page is passed over.
import { EARTH, labelName, usualOf } from "@gnoworld/core";
import type { Trend, Worlds } from "@gnoworld/schemas/indexer";
import type { Log } from "../log.ts";
import type { Recent } from "./history.ts";
import { makePresence, type Presence as Hours } from "./presence.ts";
import { chainClears, type ChainSignal, type ChainWorld, type Place } from "./score.ts";
import { callsOf } from "./shed.ts";

const HOUR = 3_600_000;
/** The most time between the two passes a window spans, and its oldest pass: a stopped job is no hour's trend. */
export const WINDOW_MOST_MS = 2 * HOUR;
/** How long a world the list first showed stays new. */
export const NEW_MS = 24 * HOUR;
type NewTrend = Extract<Trend, { kind: "new" }>;
/** The chain's part of the trends, as the last pass left it. */
export interface ChainRead {
  readonly worlds: readonly ChainWorld[];
  readonly newest: readonly NewTrend[];
}
/** What a pass read of each realm, by its path: its window above the last pass's height, none when it had no height to count from; and when
 * the job read it. */
type PassReads = ReadonlyMap<string, { readonly recent?: Recent; readonly at: number }>;
type World = Worlds["worlds"][number];
/** The chain's habits: each world's busiest window of each hour over 14 days, in presence.ts's store. */
interface Habits {
  readonly transactions: Hours;
  readonly addresses: Hours;
}

export interface TrendKeeper {
  /** A pass wrote `worlds`, having read `read`'s realms. */
  passed: (worlds: Worlds, read: PassReads) => void;
  /** The chain's windows and new world since the last pass. */
  chain: () => ChainRead;
  /** Writes the habits to their files, as each pass and the job's stop do. */
  save: () => void;
}

// What names a world and opens its page: its title as the cosmos's labels give it, and its first realm; none for a world with neither, nor
// for one of the Earth's id, which the page's Earth is not (F4550).
function placed(world: World): Place | undefined {
  const [title, realm] = [labelName(world.id), world.realms[0]?.path];
  return title === null || realm === undefined || world.id === EARTH ? undefined : { title, realm };
}

// A world's window over the realms both passes read: its transactions, and the different addresses that sent them, each counted once across
// its realms, from its realms' first read in the last pass to their last in this one; none for a world with no such realm.
function windowOf(
  world: World,
  before: ReadonlyMap<string, number>,
  now: PassReads,
): { transactions: number; addresses: number; from: number; to: number } | undefined {
  let [from, to] = [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
  const [transactions, addresses] = [new Set<string>(), new Set<string>()];
  for (const { path } of world.realms) {
    const [read, was] = [now.get(path), before.get(path)];
    if (read?.recent === undefined || was === undefined) continue;
    [from, to] = [Math.min(from, was), Math.max(to, read.at)];
    for (const mark of read.recent.transactions) transactions.add(mark);
    for (const caller of read.recent.callers) addresses.add(caller);
  }
  return to > from ? { transactions: transactions.size, addresses: addresses.size, from, to } : undefined;
}

// Each world's window since the pass before, kept in its habits, beside its usual; none on a first pass or past the window. ponytail: a
// usual reads a world's 14 days of hours (336 at most) for each world the pass read, once a pass.
function windowsOf(
  { worlds, read }: { worlds: Worlds; read: PassReads },
  last: { at: string; read: ReadonlyMap<string, number> } | undefined,
  habits: Habits | undefined,
): ChainWorld[] {
  if (last === undefined) return [];
  const at = Date.parse(worlds.updated);
  const span = at - Date.parse(last.at);
  if (!(span > 0 && span <= WINDOW_MOST_MS)) return [];
  const counted = worlds.worlds.flatMap((world) => {
    const window = windowOf(world, last.read, read);
    return window === undefined ? [] : [{ world, ...window }];
  });
  // A habit keeps the windows of a world it holds, and a world's first that clears the floor: one address's calls take no place there.
  const keep = (kept: Hours, pick: (window: (typeof counted)[number]) => number): void => {
    kept.record(
      new Map(
        counted.flatMap((window) =>
          chainClears(window) || kept.history(window.world.id).length > 0
            ? [[window.world.id, pick(window)] as const]
            : [],
        ),
      ),
    );
  };
  // Each count at its pace an hour over its world's own reads, as a habit keeps it: a window longer than usual is no rise.
  const pace = (count: number, { from, to }: { from: number; to: number }): number =>
    Math.round((count * HOUR) / (to - from));
  if (habits !== undefined) {
    keep(habits.transactions, (window) => pace(window.transactions, window));
    keep(habits.addresses, (window) => pace(window.addresses, window));
  }
  const signal = (count: number, window: (typeof counted)[number], kept: Hours | undefined): ChainSignal => ({
    now: pace(count, window),
    usual: kept === undefined ? null : usualOf(kept.history(window.world.id), at),
    count,
  });
  return counted.map((window) => ({
    world: window.world.id,
    place: placed(window.world),
    transactions: signal(window.transactions, window, habits?.transactions),
    addresses: signal(window.addresses, window, habits?.addresses),
    since: new Date(window.from).toISOString(),
    at: new Date(window.to).toISOString(),
  }));
}

const byId = (a: World, b: World): number => (a.id < b.id ? -1 : Number(a.id > b.id));

// The world first seen most lately within a day of the pass, the most called then the first by id among those seen at once.
function newest(worlds: Worlds): NewTrend[] {
  const at = Date.parse(worlds.updated);
  const fresh = worlds.worlds.flatMap((world) => {
    const seen = Date.parse(world.seen ?? "");
    const place = seen <= at && at - seen <= NEW_MS ? placed(world) : undefined;
    return place === undefined ? [] : [{ world, seen, place, calls: callsOf(world) }];
  });
  const [first] = fresh.sort((a, b) => b.seen - a.seen || b.calls - a.calls || byId(a.world, b.world));
  if (first === undefined) return [];
  return [{ kind: "new", world: first.world.id, ...first.place, at: new Date(first.seen).toISOString() }];
}

/** The chain's part of the trends, each pass against the pass before it, its windows kept in `habits` when given. ponytail: it keeps the paths
 * the last pass read, at most the job's HISTORY_MAX_CALLS; past that cap each pass reads a run of realms that moves on, so a world is known by
 * the realms both passes read, and unknown once the runs no longer meet (from twice the cap). */
export function makeTrends(options: { habits?: Habits; log?: Log } = {}): TrendKeeper {
  const { habits, log = () => undefined } = options;
  let last: { at: string; read: ReadonlyMap<string, number> } | undefined;
  let kept: ChainRead = { worlds: [], newest: [] };
  // ponytail: each habit writes its whole file at once, about 44 ms for a full one (5.7 MB, 7t3's review), twice a pass.
  const save = (): void => {
    if (habits !== undefined && ![habits.transactions.save(), habits.addresses.save()].every(Boolean))
      log("alert", { error: "trends_write" });
  };
  return {
    passed(worlds, read) {
      const windows = windowsOf({ worlds, read }, last, habits);
      save();
      kept = { worlds: windows, newest: newest(worlds) };
      last = { at: worlds.updated, read: new Map([...read].map(([path, { at }]) => [path, at])) };
    },
    chain: () => kept,
    save,
  };
}

/** The chain's habits read from their files, beside the database (7t3). */
export const habitsAt = (files: { transactions: string; addresses: string }, now: () => number): Habits => ({
  transactions: makePresence({ file: files.transactions, now }),
  addresses: makePresence({ file: files.addresses, now }),
});
