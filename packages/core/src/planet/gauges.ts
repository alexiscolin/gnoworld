// A world's two gauges (ADR-0002 §10): a vitality that remembers, moving a few percent a day, and the people present. Time comes in as a
// parameter. A gauge is a reading of the day, never part of a look: `Math.log1p`, approximate from one engine to the next, reaches no seed.
// Tier 1 (docs/REVIEW.md).
import { clamp01 } from "../space/smooth.ts";

// Climbing takes about a month and falling three: a world keeps what it became.
const RISE = 0.03;
const FALL = 0.01;
// A universe's ladders start this high (32 rungs, five doublings): alone on the chain, one person is no crowd and one message no beacon.
const QUIET_TOP = 31;

export interface UseCounts {
  /** Distinct people speaking in its rooms, and follows. */
  readonly social: number;
  /** Distinct callers, and imports from other namespaces. */
  readonly realm: number;
}

/** The callers a worlds' file counts in a world's realms, its realm use; a realm whose callers it does not count adds none. */
export const callersIn = (realms: readonly { readonly callers: number | null }[]): number =>
  realms.reduce((sum, { callers }) => sum + (callers ?? 0), 0);

/** `value` as a share, NaN counting for nothing. */
export const share = (value: number): number => clamp01(value) || 0;

/** `count` on a logarithmic scale up to `top`, 0 to 1, with no floor: the top reaches 1 whatever the counts; nothing to climb when `top` is
 * none. */
export const scaleOf = (count: number, top: number): number =>
  top > 0 ? share(Math.log1p(count) / Math.log1p(top)) : 0;

const rung = (count: number, busiest: number) => scaleOf(count, Math.max(busiest, QUIET_TOP));

// The universe of the day is read at a high rank, not at its busiest world: one world of a thousand sybil callers would halve every other's
// use (F4111). Nearest rank, each half apart.
const RANK = 0.95;

const rankOf = (values: readonly number[]) => {
  const sorted = values.map((value) => (Number.isFinite(value) ? value : 0)).sort((one, other) => one - other);
  return sorted[Math.ceil(RANK * sorted.length) - 1] ?? 0;
};

/** What a universe's worlds are weighed against: its 95th percentile, social and realm apart. */
export const referenceOf = (worlds: readonly UseCounts[]): UseCounts => ({
  social: rankOf(worlds.map(({ social }) => social)),
  realm: rankOf(worlds.map(({ realm }) => realm)),
});

/** How used a world is against the universe of the day, half social and half realm, on a logarithmic ladder (ADR-0002 §3). */
export const useOf = (world: UseCounts, busiest: UseCounts): number =>
  (rung(world.social, busiest.social) + rung(world.realm, busiest.realm)) / 2;

/** The people here against the busiest world of the day, capped: a quiet world shows a little, the busiest floods nothing (ADR-0002 §3). */
export const presenceOf = (people: number, busiest: number): number => rung(people, busiest);

/** A vitality `days` later, moved towards `use` at its own pace and never past it. */
export function nextVitality(vitality: number, use: number, days: number): number {
  const [from, to, span] = [share(vitality), share(use), days > 0 ? days : 0];
  return to > from ? Math.min(to, from + RISE * span) : Math.max(to, from - FALL * span);
}
