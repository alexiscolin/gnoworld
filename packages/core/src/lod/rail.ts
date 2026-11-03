// The rail (ADR-0002 §1's row and §10; plan §9, question 7): the Earth first, then the trends, the most people here now; the rising worlds,
// against their own 14 days; the seeds, new worlds nobody here visited; each world once, 25 at most. Its order holds: a world moves above
// one shown above it only once it is clearly ahead, so a count that wavers moves nothing.
import { titleOf, type LabelAsk } from "./labels.ts";

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
  readonly score: number;
}

// A world's section and its score in it, higher first: a seed shows as one whatever else it does, a rising world among the rising though
// people are here; the people here, the rise, a seed's youth.
function placeOf({ kind, signals = {}, days = 0 }: RailAsk): readonly [RailSection, number] | null {
  if (kind === "earth") return ["earth", 0];
  if (signals.uncharted === true) return ["seed", -days];
  if (signals.rise !== undefined) return ["rising", signals.rise];
  const { here = 0 } = signals;
  return here > 0 ? ["trend", here] : null;
}

const byScore = (a: Held, b: Held) => b.score - a.score || (a.world.id < b.world.id ? -1 : 1);
const best = (held: readonly Held[] = [], most: number) => [...held].sort(byScore).slice(0, most);

// Those shown before in their order, the others after them by score; then a world goes above the one over it only when clearly ahead.
// ponytail: neighbours swapped till none is clearly ahead of the one above it, 24 worlds at most, so at most 276 swaps.
function steady(chosen: readonly Held[], shown: ReadonlyMap<string, number>): Held[] {
  const at = (held: Held) => shown.get(held.world.id) ?? Number.POSITIVE_INFINITY;
  const order = [...chosen].sort((a, b) => at(a) - at(b) || byScore(a, b));
  for (let moved = true; moved;) {
    moved = false;
    for (let below = 1; below < order.length; below += 1) {
      const [upper, lower] = [order[below - 1], order[below]];
      if (upper === undefined || lower === undefined || !(lower.score > AHEAD * upper.score)) continue;
      [order[below - 1], order[below]] = [lower, upper];
      moved = true;
    }
  }
  return order;
}

/** The rail's worlds in their order, from `asks` in any order; `shown`, the ids it shows now, which holds their order. */
export function chooseRail(asks: readonly RailAsk[], shown: readonly string[] = []): RailWorld[] {
  const sections = new Map<RailSection, Held[]>();
  const taken = new Set<string>();
  for (const ask of asks) {
    if (taken.has(ask.id)) continue;
    taken.add(ask.id);
    const place = placeOf(ask);
    const title = place === null ? null : titleOf(ask);
    if (place === null || title === null) continue;
    const [section, score] = place;
    const list = sections.get(section) ?? [];
    list.push({ world: { id: ask.id, title, section }, score });
    sections.set(section, list);
  }
  const position = new Map(shown.map((id, at) => [id, at]));
  const earth = (sections.get("earth") ?? []).slice(0, 1);
  const rising = steady(best(sections.get("rising"), RISING_MOST), position);
  const seeds = best(sections.get("seed"), SEEDS_MOST);
  const room = RAIL_MOST - earth.length - rising.length - seeds.length;
  const trends = steady(best(sections.get("trend"), room), position);
  return [...earth, ...trends, ...rising, ...seeds].map(({ world }) => world);
}
