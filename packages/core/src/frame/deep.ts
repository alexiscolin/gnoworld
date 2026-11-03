// The view at rest in depth across its frame (part 7p; Alexis, 2026-11-03, "la perspective doit être partout"): beside its close world, the
// Earth and its postcards, a few real worlds of other nearby systems drawn as bodies at their own size and place, in the middle and far, so
// the frame's sizes span about ten times. Each stands clear of all else through its turn, none of one size at one height beside its
// neighbour, the whole judged as the view is, on the way down too. Nothing invented: a world drawn is one of the file's. In a chunk of its
// own: it reads the view with the functions the search lends it.
import { EARTH_PLACE, GRAIN, type Orbiter, type StarSystem } from "../cosmos/system.ts";
import { BODY_PIXELS } from "../lod/ladder.ts";
import { distanceOf, type Point } from "../space/cell.ts";
import { SWAY_CORNERS } from "../space/drift.ts";
import type { Lent } from "./lent.ts";
import type { RestView } from "./rest.ts";
import type { Card } from "./restCards.ts";
import type { Look, Seen } from "./restLook.ts";

/** A world drawn for depth, by its system's index and its own. */
export interface Deep {
  readonly system: number;
  readonly world: number;
}

/** A view at rest, as the chunk that adds its depth reads it; what stands grows as that chunk stands more. */
export interface Judge {
  /** The view on each screen it is composed for, the video's first, and at each corner of its sway on both. */
  readonly looks: readonly Look[];
  readonly swayed: readonly Look[];
  /** The video's screen's lens, in pixels. */
  readonly focal: number;
  /** What stands: a ball with its room on each screen, a spot on the video's, and its bodies by system for the way down. */
  readonly balls: Seen[][];
  readonly spots: Seen[];
  readonly cards: Pick<Card, "system" | "worlds">[];
  /** Where a world stands at rest. */
  readonly placeOf: (system: StarSystem, world: Orbiter) => Point;
  /** The view's rule on the video's screen: `spots` with its Earth and great star, no crowd, pile or row. */
  readonly composed: (spots: readonly Seen[]) => boolean;
  /** Whether `cards` stand a row on any frame of the way down. */
  readonly rowDown: (cards: readonly Pick<Card, "system" | "worlds">[]) => boolean;
  readonly evenRow: (spots: readonly Seen[]) => boolean;
  /** Whether two of `spots` stand beside each other of one size at one height, on a screen `height` pixels high. */
  readonly twins: (spots: readonly Seen[], height: number) => boolean;
}

/** `view` over `systems` as its judge, read with the search's `lent` functions: what stands, each postcard's ball at its worlds' own size
 * at the least with its bodies as drawn, and the close world, held still as the scene holds it. */
export function judgeOf(systems: readonly StarSystem[], view: RestView, lent: Lent): Judge {
  const { cameraTowards, composed, evenRow, focalOf, looksFrom, placeOf, rowOnTheWayDown, swayed, twins } = lent;
  const camera = cameraTowards(view.eye, EARTH_PLACE);
  const looks = looksFrom(camera);
  const [first] = looks;
  const at = (system: StarSystem, world: Orbiter) => placeOf(system, world, 0);
  const deep = view.close !== undefined;
  const judge: Judge = {
    looks,
    swayed: SWAY_CORNERS.flatMap((sway) => looksFrom(swayed(camera, sway))),
    focal: focalOf(first?.height ?? 1),
    balls: looks.map(() => []),
    spots: [],
    cards: [],
    placeOf: at,
    composed: (spots) =>
      first === undefined ||
      composed(spots, first.earth, { deep, lights: [first.star], width: first.width, height: first.height }),
    rowDown: (cards) => rowOnTheWayDown(camera, cards, { most: 0 }),
    evenRow,
    twins,
  };
  standing(judge, systems, { view, lent });
  return judge;
}

// What stands before the depth, into `judge`: each postcard's ball at its worlds' own size at the least, with its bodies as drawn, and the
// close world, held still as the scene holds it.
function standing(judge: Judge, systems: readonly StarSystem[], { view, lent }: { view: RestView; lent: Lent }): void {
  const { drawnOf, postcardOf } = lent;
  const [first] = judge.looks;
  const stand = (balled: (look: Look) => Seen, card: Pick<Card, "system" | "worlds">) => {
    judge.looks.forEach((look, index) => judge.balls[index]?.push(balled(look)));
    judge.cards.push(card);
    for (const world of card.worlds)
      if (first !== undefined) judge.spots.push(first.seen(judge.placeOf(card.system, world), world.radius));
  };
  for (const index of view.postcards) {
    const system = systems[index];
    if (system === undefined) continue;
    const card = postcardOf(system, view.eye);
    const reach = Math.max(0, ...drawnOf(card, 1).map(({ orbit, radius }) => orbit + radius));
    stand((look) => look.ball(card.system.place, reach), { system: card.system, worlds: drawnOf(card) });
  }
  const close = systems[view.close?.system ?? -1];
  const world = close?.worlds[view.close?.world ?? -1];
  if (close !== undefined && world !== undefined)
    stand((look) => look.seen(judge.placeOf(close, world), world.radius), {
      system: { ...close, spin: 0 },
      worlds: [world],
    });
}

// Four at most, each 1.5 times a body's least size or more, pixels of room round it, and twice the Earth's radius round the Earth, where
// its Moon's ring stands; never of one size with its nearest neighbour in a column, 40 degrees from upright at most.
const MOST = 4;
const LEAST = 1.5 * BODY_PIXELS;
const MARGIN = 24;
const APART = 1.5;
const UPRIGHT = Math.tan((40 * Math.PI) / 180);

const gap = (a: Seen, b: Seen) => Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius;

// Whether `spot` stands of one size with its nearest of `spots` and above or under it, within 40 degrees of upright: a column of two reads
// as laid out, as a row does (the view's rule keeps rows out).
const column = (spot: Seen, spots: readonly Seen[]) => {
  const apart = (other: Seen) => Math.hypot(other.x - spot.x, other.y - spot.y);
  const next = spots.reduce<Seen | undefined>(
    (best, other) => (best === undefined || apart(other) < apart(best) ? other : best),
    undefined,
  );
  return (
    next !== undefined &&
    Math.max(next.radius, spot.radius) < APART * Math.min(next.radius, spot.radius) &&
    Math.abs(next.x - spot.x) < UPRIGHT * Math.abs(next.y - spot.y)
  );
};

// A world's ball, its orbit round its star, whole and clear on one screen: off the hero, the star's heart, the Earth and its ring, and
// every ball already standing.
const clearOn = (look: Look, ball: Seen, balls: readonly Seen[]) =>
  look.whole(ball, MARGIN) &&
  look.clear(ball, MARGIN) &&
  gap(ball, look.earth) >= look.earth.radius + MARGIN &&
  balls.every((other) => gap(ball, other) >= MARGIN);

/** The worlds of other nearby systems `view` draws as bodies for depth, read through its `judge`, nearest first, one a system, four at most;
 * each stands in the judge as it is chosen. ponytail: a pass over every system and a sort, once a view, in a chunk asked after it. */
export function deepOf(systems: readonly StarSystem[], view: RestView, judge: Judge): Deep[] {
  const { looks, balls, spots, cards } = judge;
  const [first] = looks;
  if (first === undefined) return [];
  const taken = new Set<number>([0, ...view.postcards, ...(view.close === undefined ? [] : [view.close.system])]);
  const holds = (system: StarSystem, world: StarSystem["worlds"][number]) => {
    const seen = first.seen(judge.placeOf(system, world), world.radius);
    const all = [...spots, seen];
    return (
      seen.radius >= LEAST &&
      looks.every((look, at) => clearOn(look, look.ball(system.place, world.orbit + world.radius), balls[at] ?? [])) &&
      !column(seen, [first.earth, ...spots]) &&
      !judge.twins([first.earth, ...all], first.height) &&
      judge.composed(all) &&
      !judge.rowDown([...cards, { system, worlds: [world] }])
    );
  };
  const bodies: Deep[] = [];
  const order = systems
    .map((system, index) => ({ system, index, away: distanceOf(system.place, view.eye) }))
    .filter(({ system, index }) => !taken.has(index) && system.worlds.length > 0)
    .sort((a, b) => a.away - b.away);
  for (const { system, index } of order) {
    if (bodies.length === MOST) break;
    const found = system.worlds
      .map((world, at) => ({ world, at }))
      .filter(({ world }) => world.radius >= GRAIN)
      .sort((a, b) => b.world.radius - a.world.radius)
      .find(({ world }) => holds(system, world));
    if (found === undefined) continue;
    const reach = found.world.orbit + found.world.radius;
    looks.forEach((look, at) => balls[at]?.push(look.ball(system.place, reach)));
    spots.push(first.seen(judge.placeOf(system, found.world), found.world.radius));
    cards.push({ system, worlds: [found.world] });
    bodies.push({ system: index, world: found.at });
  }
  return bodies;
}
