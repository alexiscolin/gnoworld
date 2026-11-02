// A world rising against its own last 14 days (plan §9, question 6; ADR-0002 §10): its people now beside its usual hour, the middle of the
// hours its history holds, so a small world can stand out where the universe's busiest would drown it. An hour the history never kept is
// no zero: the job keeps the hours it sampled.

/** One hour of a world's presence history: the hour's start, in milliseconds, and the most people seen in it (server/src/worlds/presence.ts). */
export interface PresenceSlot {
  readonly at: number;
  readonly people: number;
}

const HOUR = 3_600_000;

/** How far back a world is its own measure, how many hours make a usual one, the share above it that rises, and the fewest more people. */
export const RISE = { days: 14, hours: 24, least: 0.2, people: 3 } as const;

/** How far `people` now stand above the world's usual hour over its last 14 days, as a share (0.21 for 21%), or null: a history too short
 * to say, or no rise. The hour `now` falls in is left out of its own usual. */
export function riseOf(people: number, history: readonly PresenceSlot[], now: number): number | null {
  if (!Number.isFinite(people) || people < 0) return null;
  const hour = Math.floor(now / HOUR) * HOUR;
  const oldest = hour - RISE.days * 24 * HOUR;
  const counts = history
    .filter(({ at }) => at >= oldest && at < hour)
    .map((slot) => slot.people)
    .sort((a, b) => a - b);
  if (counts.length < RISE.hours) return null;
  const usual = counts[Math.floor(counts.length / 2)] ?? 0;
  const rise = (people - usual) / Math.max(usual, 1);
  return rise > RISE.least && people - usual >= RISE.people ? rise : null;
}
