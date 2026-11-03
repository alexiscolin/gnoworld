// The rail (ADR-0002 §1's row and §10; plan §9, question 7): the Earth first, then the trends, the most people here now and then, as
// who is here names hubs alone, the most callers; the rising worlds, against their own 14 days; the seeds, new worlds nobody here visited;
// each world once, 25 at most. Its order holds: a world moves above one shown above it only once it is clearly ahead.
import { mostPopular, titleOf, type LabelAsk } from "./labels.ts";

// What the rail weighs a world by when nobody is here: the callers the worlds' file counts (core's gauges); and its footprint, which the
// labels keep clear (their module, which the labels' chunk and the rail's share).
export { callersIn } from "../planet/gauges.ts";
export { RAIL } from "./labels.ts";

/** The most worlds the rail shows, the Earth one of them, and the most rising worlds and seeds among them. */
export const RAIL_MOST = 25;
export const RISING_MOST = 8;
export const SEEDS_MOST = 4;
/** How many times another world's people here, or its rise, a world must have to move above it. */
export const AHEAD = 1.25;

type RailSection = "earth" | "trend" | "rising" | "seed";

/** A world the rail may show: a label's ask, and a new world's age in days. */
export interface RailAsk extends LabelAsk {
  readonly days?: number;
}

export interface RailWorld {
  readonly id: string;
  readonly title: string;
  readonly section: RailSection;
}

interface Held {
  readonly world: RailWorld;
  // People here (0) before callers alone (1) among the trends; the count the hold weighs within its group.
  readonly group: number;
  readonly score: number;
}

// A world's section: a seed shows as one whatever else it does, a rising world among the rising though people are here, and a trend is a
// world with people here or, since who is here names hubs alone, callers the worlds' file counts.
function sectionOf({ kind, signals = {} }: RailAsk): RailSection | null {
  if (kind === "earth") return "earth";
  if (signals.uncharted === true) return "seed";
  if (signals.rise !== undefined) return "rising";
  const { here = 0, use = 0 } = signals;
  return here > 0 || use > 0 ? "trend" : null;
}

// What the hold weighs: the rise, or the people here, or else the callers.
function heldOf(world: RailWorld, { signals = {} }: RailAsk): Held {
  const { rise = 0, here = 0, use = 0 } = signals;
  if (world.section === "rising") return { world, group: 0, score: rise };
  return here > 0 ? { world, group: 0, score: here } : { world, group: 1, score: use };
}

// Whether `lower` is clearly ahead of `upper`: more, and by AHEAD times. A score below zero is never ahead of a larger one, so every swap
// leaves the order nearer sorted and the swaps end.
const ahead = (lower: Held, upper: Held) =>
  lower.group === upper.group && lower.score > upper.score && lower.score > AHEAD * upper.score;

// Those shown before in their order, the others after them as ranked, people before callers; then a world goes above the one over it only
// when clearly ahead in its group.
// ponytail: neighbours swapped till none is clearly ahead of the one above it, 24 worlds at most, so at most 276 swaps.
function steady(chosen: readonly Held[], shown: ReadonlyMap<string, number>): Held[] {
  const at = (held: Held) => shown.get(held.world.id) ?? Number.POSITIVE_INFINITY;
  const ranked = new Map(chosen.map((held, rank) => [held, rank]));
  const order = [...chosen].sort(
    (a, b) => a.group - b.group || at(a) - at(b) || (ranked.get(a) ?? 0) - (ranked.get(b) ?? 0),
  );
  for (let moved = true; moved;) {
    moved = false;
    for (let below = 1; below < order.length; below += 1) {
      const [upper, lower] = [order[below - 1], order[below]];
      if (!upper || !lower || !ahead(lower, upper)) continue;
      [order[below - 1], order[below]] = [lower, upper];
      moved = true;
    }
  }
  return order;
}

// The newest seeds first, one of unknown age last; a tie by id.
const youngest = (asks: readonly RailAsk[]) =>
  [...asks].sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity) || (a.id < b.id ? -1 : 1));

// Each world in its section, from its first ask.
function sectionsOf(asks: readonly RailAsk[]): Map<RailSection, RailAsk[]> {
  const sections = new Map<RailSection, RailAsk[]>();
  const taken = new Set<string>();
  for (const ask of asks) {
    if (taken.has(ask.id)) continue;
    taken.add(ask.id);
    const section = sectionOf(ask);
    if (section === null) continue;
    const list = sections.get(section) ?? [];
    list.push(ask);
    sections.set(section, list);
  }
  return sections;
}

// The first `most` of `ranked` that have a title, in its order: a world only an address names is left out, and no title is made for a
// world past the cap (a file holds up to 20,000).
function kept(ranked: readonly RailAsk[], section: RailSection, most: number): Held[] {
  const held: Held[] = [];
  for (const ask of ranked) {
    if (held.length >= most) break;
    const title = titleOf(ask);
    if (title !== null) held.push(heldOf({ id: ask.id, title, section }, ask));
  }
  return held;
}

/** The rail's worlds in their order, from `asks` in any order; `shown`, the ids it shows now, which holds their order. */
export function chooseRail(asks: readonly RailAsk[], shown: readonly string[] = []): RailWorld[] {
  const sections = sectionsOf(asks);
  const position = new Map(shown.map((id, at) => [id, at]));
  const earth = kept(sections.get("earth") ?? [], "earth", 1);
  const rising = steady(kept(mostPopular(sections.get("rising") ?? []), "rising", RISING_MOST), position);
  const seeds = kept(youngest(sections.get("seed") ?? []), "seed", SEEDS_MOST);
  const room = RAIL_MOST - earth.length - rising.length - seeds.length;
  const trends = steady(kept(mostPopular(sections.get("trend") ?? []), "trend", room), position);
  return [...earth, ...trends, ...rising, ...seeds].map(({ world }) => world);
}
