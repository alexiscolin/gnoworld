// The rail (ADR-0002 §1's row and §10; plan §9, question 7): the Earth first, then the trends, the most people here now and then, as
// who is here names hubs alone, the most callers; the rising worlds, against their own 14 days; the seeds, new worlds nobody here visited;
// each world once, 25 at most. Its order holds: a world moves above one shown above it only once it is clearly ahead.
import { mostPopular, titleOf, type LabelAsk } from "./labels.ts";

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

// What the hold weighs: the rise, the people here or else the callers, a seed's youth.
function heldOf(world: RailWorld, { signals = {}, days = 0 }: RailAsk): Held {
  const { rise = 0, here = 0, use = 0 } = signals;
  if (world.section === "rising") return { world, group: 0, score: rise };
  if (world.section === "seed") return { world, group: 0, score: -days };
  return here > 0 ? { world, group: 0, score: here } : { world, group: 1, score: use };
}

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
      if (upper?.group !== lower?.group || !lower || !upper || !(lower.score > AHEAD * upper.score)) continue;
      [order[below - 1], order[below]] = [lower, upper];
      moved = true;
    }
  }
  return order;
}

// An ask with the title it shows.
type Titled = RailAsk & { readonly title: string };

// The newest seeds first, one of unknown age last; a tie by id.
const youngest = (asks: readonly Titled[]) =>
  [...asks].sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity) || (a.id < b.id ? -1 : 1));

// Each world in its section with its title, from its first ask; a world only an address names is none.
function sectionsOf(asks: readonly RailAsk[]): Map<RailSection, Titled[]> {
  const sections = new Map<RailSection, Titled[]>();
  const taken = new Set<string>();
  for (const ask of asks) {
    if (taken.has(ask.id)) continue;
    taken.add(ask.id);
    const section = sectionOf(ask);
    const title = section === null ? null : titleOf(ask);
    if (section === null || title === null) continue;
    const list = sections.get(section) ?? [];
    list.push({ ...ask, title });
    sections.set(section, list);
  }
  return sections;
}

/** The rail's worlds in their order, from `asks` in any order; `shown`, the ids it shows now, which holds their order. */
export function chooseRail(asks: readonly RailAsk[], shown: readonly string[] = []): RailWorld[] {
  const sections = sectionsOf(asks);
  const position = new Map(shown.map((id, at) => [id, at]));
  const held = (list: readonly Titled[], section: RailSection) =>
    list.map((ask) => heldOf({ id: ask.id, title: ask.title, section }, ask));
  const earth = held((sections.get("earth") ?? []).slice(0, 1), "earth");
  const rising = steady(held(mostPopular(sections.get("rising") ?? []).slice(0, RISING_MOST), "rising"), position);
  const seeds = held(youngest(sections.get("seed") ?? []).slice(0, SEEDS_MOST), "seed");
  const room = RAIL_MOST - earth.length - rising.length - seeds.length;
  const trends = steady(held(mostPopular(sections.get("trend") ?? []).slice(0, room), "trend"), position);
  return [...earth, ...trends, ...rising, ...seeds].map(({ world }) => world);
}
