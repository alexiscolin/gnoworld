// The daily expedition (ADR-0002 §1): three stops, the same for everyone on a UTC day, a pure function of the day and the curated pool, the
// first among the stops where something moves every day; what a device reached of them that day; and the streak of days it reached all
// three, one step a UTC day.
import { textHash } from "../space/cell.ts";
import { daysBetween } from "./day.ts";

/** The stops of a day. */
const EXPEDITION_STOPS = 3;

/** A stop of the pool, as the expedition picks it. */
interface Pooled {
  readonly id: string;
  readonly live?: boolean | undefined;
}

/** The day's stops, in their order: the pool shuffled by the day, the first live stop first, then the next ones; fewer for a small pool. */
export function expeditionOf<T extends Pooled>(day: string, pool: readonly T[]): T[] {
  const rank = new Map(pool.map((stop) => [stop, textHash(`gnoworld/expedition/v1 ${day} ${stop.id}`)]));
  // The id breaks a tie of two hashes, so the order is the same on every device whatever the file's order.
  const order = [...pool].sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0) || (a.id < b.id ? -1 : 1));
  const first = order.find((stop) => stop.live === true) ?? order[0];
  if (first === undefined) return [];
  return [first, ...order.filter((stop) => stop !== first)].slice(0, EXPEDITION_STOPS);
}

/** What a device reached of a day's expedition. */
interface Reached {
  readonly day: string;
  readonly reached: readonly string[];
}

/** The stops reached on `day`, by their keys: none from another day's record. */
export const reachedOn = (done: Reached | null, day: string): readonly string[] =>
  done?.day === day ? done.reached : [];

/** The record once `key` is reached on `day`: another day's record starts again; a key already reached adds nothing. */
export function reach(done: Reached | null, day: string, key: string): { day: string; reached: string[] } {
  const reached = reachedOn(done, day);
  return { day, reached: reached.includes(key) ? [...reached] : [...reached, key] };
}

/** The streak: the last UTC day the whole expedition was reached, the days in a row to it, the longest run. */
interface Streak {
  readonly day: string;
  readonly count: number;
  readonly best: number;
}

/** The streak once the whole expedition is reached on `day`: the next day adds one, a gap starts again at one, the same day or a day before
 * the last one (a clock set back) changes nothing. */
export function streakAfter(streak: Streak | null, day: string): Streak {
  if (streak === null) return { day, count: 1, best: 1 };
  const gap = daysBetween(streak.day, day);
  if (!(gap >= 1)) return streak;
  const count = gap === 1 ? streak.count + 1 : 1;
  return { day, count, best: Math.max(streak.best, count) };
}

/** The days in a row as `today` shows them: the count while its last day is today or yesterday, else none. */
export function streakOn(streak: Streak | null, today: string): number {
  if (streak === null) return 0;
  const gap = daysBetween(streak.day, today);
  return gap === 0 || gap === 1 ? streak.count : 0;
}
