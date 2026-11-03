// The view at rest in depth across its frame (part 7p; Alexis, 2026-11-03, "la perspective doit être partout"): beside its close world, the
// Earth and its postcards, a few real worlds of other nearby systems drawn as bodies at their own size and place, in the middle and far, so
// the frame's sizes span about ten times. Each stands clear of all else through its turn, none of one size at one height beside its
// neighbour, the whole judged as the view is, on the way down too. Nothing invented: a world drawn is one of the file's. In a chunk of its
// own: it reads the view with the functions the search lends it.
import { EARTH_PLACE, GRAIN, type Orbiter, type StarSystem } from "../cosmos/system.ts";
import { BODY_PIXELS } from "../lod/ladder.ts";
import { distanceOf } from "../space/cell.ts";
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
  /** What stands: a ball with its room on each screen, a spot at rest on the video's, its bodies by system, the glowing stars' spots. */
  readonly balls: Seen[][];
  readonly spots: Seen[];
  readonly cards: Pick<Card, "system" | "worlds">[];
  readonly stars: Seen[];
  /** The view's rule on the video's screen: `spots` with its Earth and great star, no crowd, pile or row. */
  readonly composed: (spots: readonly Seen[]) => boolean;
  /** Whether `cards` stand a row on any frame of the way down. */
  readonly rowDown: (cards: readonly Pick<Card, "system" | "worlds">[]) => boolean;
  /** The search's functions it was read with. */
  readonly lent: Lent;
}

/** `view` over `systems` as its judge, read with the search's `lent` functions: what stands, each postcard's ball at its worlds' own size
 * at the least with its bodies as drawn, and the close world, held still as the scene holds it. */
export function judgeOf(systems: readonly StarSystem[], view: RestView, lent: Lent): Judge {
  const { cameraTowards, composed, focalOf, looksFrom, rowOnTheWayDown, swayed } = lent;
  const camera = cameraTowards(view.eye, EARTH_PLACE);
  const looks = looksFrom(camera);
  const [first] = looks;
  const deep = view.close !== undefined;
  const judge: Judge = {
    looks,
    swayed: SWAY_CORNERS.flatMap((sway) => looksFrom(swayed(camera, sway))),
    focal: focalOf(first?.height ?? 1),
    balls: looks.map(() => []),
    spots: [],
    cards: [],
    stars: first === undefined ? [] : [first.star],
    composed: (spots) =>
      first === undefined ||
      composed(spots, first.earth, { deep, lights: [first.star], width: first.width, height: first.height }),
    rowDown: (cards) => rowOnTheWayDown(camera, cards, { most: 0 }),
    lent,
  };
  standing(judge, systems, view);
  return judge;
}

/** Where each of `cards`' worlds stands at `seconds` into its turn on `judge`'s first screen, at its drawn size. */
const spotsAt = ({ looks: [look], lent }: Judge, cards: Judge["cards"], seconds: number): Seen[] =>
  look === undefined
    ? []
    : cards.flatMap(({ system, worlds }) =>
        worlds.map((world) => look.seen(lent.placeOf(system, world, seconds), world.radius)),
      );

// What stands before the depth, into `judge`: each postcard's ball at its worlds' own size at the least, with its bodies as drawn and its
// star, the close world, held still as the scene holds it, and the stars that glow.
const SECOND_SUN = 0.75;
function standing(judge: Judge, systems: readonly StarSystem[], view: RestView): void {
  const { drawnOf, postcardOf } = judge.lent;
  const stand = (balled: (look: Look) => Seen, card: Pick<Card, "system" | "worlds">) => {
    judge.looks.forEach((look, index) => judge.balls[index]?.push(balled(look)));
    judge.cards.push(card);
    judge.spots.push(...spotsAt(judge, [card], 0));
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
    stand((look) => look.seen(judge.lent.placeOf(close, world, 0), world.radius), {
      system: { ...close, spin: 0 },
      worlds: [world],
    });
  glowing(judge, systems, view);
}

// The postcards' stars and every other that glows, its halo three quarters whole or more, as the arrival's second sun (7d3), into `judge`.
function glowing({ looks: [first], stars, lent }: Judge, systems: readonly StarSystem[], view: RestView): void {
  systems.forEach((system, index) => {
    const star = first?.seen(system.place);
    if (star === undefined || index === 0) return;
    if (view.postcards.includes(index) || (star.depth > 0 && lent.haloAt(star.away) >= SECOND_SUN)) stars.push(star);
  });
}

// Four at most, each 1.5 times a body's least size or more, pixels of room round it, and twice the Earth's radius round the Earth, where
// its Moon's ring stands; never of one size with a neighbour, level with it or above it, 40 degrees off at most; never the fourth of a
// row, marks within a twentieth of the height across more than 0.15 of the width; off the great star's glow (the design review of 7p).
const MOST = 4;
const LEAST = 1.5 * BODY_PIXELS;
const MARGIN = 24;
const APART = 1.5;
const UPRIGHT = Math.tan((40 * Math.PI) / 180);
const ROW = { up: 0.05, across: 0.15 };
const GLOW = 0.1;

const apart = (a: Seen, b: Seen) => Math.hypot(a.x - b.x, a.y - b.y);
/** The room between two round spots' rims, in pixels: under none when they overlap. */
export const gap = (a: Seen, b: Seen) => apart(a, b) - a.radius - b.radius;
const like = (a: Seen, b: Seen) => Math.max(a.radius, b.radius) < APART * Math.min(a.radius, b.radius);
const nearestOf = (one: Seen, all: readonly Seen[]) =>
  all.reduce<Seen | undefined>(
    (best, other) => (other === one || (best !== undefined && apart(one, best) <= apart(one, other)) ? best : other),
    undefined,
  );

// Whether `spot` and a neighbour, either the other's nearest of `all`, stand of one size and as `along` says: level, or a column.
const paired = (spot: Seen, all: readonly Seen[], along: (one: Seen, other: Seen) => boolean) =>
  all.some((one) => {
    const next = nearestOf(one, all);
    return next !== undefined && (one === spot || next === spot) && like(one, next) && along(one, next);
  });

// Whether four marks stand a row on `look`: level within a twentieth of its height, and wide. Bodies, the Earth and the glowing stars
// mixed: gnotif made the fourth of one with gnoslinger and two stars (the design review of 7p).
const aRow = (four: readonly Seen[], { width, height }: Look) => {
  const [ys, xs] = [four.map(({ y }) => y), four.map(({ x }) => x)];
  return Math.max(...ys) - Math.min(...ys) < ROW.up * height && Math.max(...xs) - Math.min(...xs) > ROW.across * width;
};

// Whether `spot` makes the fourth of a row with three of `marks`. ponytail: n³ on the dozen marks a view stands.
const lengthens = (spot: Seen, marks: readonly Seen[], look: Look) =>
  marks.some((a, i) =>
    marks.slice(i + 1).some((b, j) => marks.slice(i + j + 2).some((c) => aRow([a, b, c, spot], look))),
  );

// A world's ball, its orbit round its star, whole and clear on one screen: off the hero, the star's heart, the Earth and its ring, and
// every ball already standing.
const clearOn = (look: Look, ball: Seen, balls: readonly Seen[]) =>
  look.whole(ball, MARGIN) &&
  look.clear(ball, MARGIN) &&
  gap(ball, look.earth) >= look.earth.radius + MARGIN &&
  balls.every((other) => gap(ball, other) >= MARGIN);

// Whether `world` of `system` stands as the frame needs on the video's screen `seconds` into the turn, beside what stands then.
function standsAt(judge: Judge, card: Pick<Card, "system" | "worlds">, seconds: number): boolean {
  const { looks, cards, stars, lent } = judge;
  const [first] = looks;
  const [spot] = spotsAt(judge, [card], seconds);
  if (first === undefined || spot === undefined) return false;
  const spots = spotsAt(judge, cards, seconds);
  const all = [first.earth, ...spots, spot];
  const shown = [first.earth, ...spots, ...stars].filter(
    ({ x, y }) => x >= 0 && x <= first.width && y >= 0 && y <= first.height,
  );
  return (
    spot.radius >= LEAST &&
    gap(spot, first.star) >= GLOW * first.height &&
    !paired(spot, all, (one, other) => lent.atOneHeight(one, other, first.height)) &&
    !paired(spot, all, (one, other) => Math.abs(one.x - other.x) < UPRIGHT * Math.abs(one.y - other.y)) &&
    !lengthens(spot, shown, first) &&
    judge.composed([...spots, spot])
  );
}

// A project tried at this many places round the Earth, a twelfth of a turn apart from its own.
const TRIES = 12;

/** The Earth's hand-made projects as the view at rest stands them (7v), `earth` held still: each at the first of twelve places round the
 * Earth, from its own, that stands clear in `judge` as a depth's world must, its orbit's ball aside, for they stand by the Earth; one with
 * none is left out. Each stands in the judge as it is placed, before the depth's worlds are chosen. */
export function projectsOf(judge: Judge, earth: StarSystem): StarSystem {
  const still = { ...earth, spin: 0 };
  const worlds: Orbiter[] = [];
  for (const world of earth.worlds) {
    const card = Array.from({ length: TRIES }, (_, at) => ({
      system: still,
      worlds: [{ ...world, phase: world.phase + (at * 2 * Math.PI) / TRIES }],
    })).find((tried) => standsAt(judge, tried, 0) && !judge.rowDown([...judge.cards, tried]));
    if (card === undefined) continue;
    judge.spots.push(...spotsAt(judge, [card], 0));
    judge.cards.push(card);
    worlds.push(...card.worlds);
  }
  return { ...still, worlds };
}

/** The worlds of other nearby systems `view` draws as bodies for depth, read through its `judge`, nearest first, one a system, four at most;
 * each stands in the judge as it is chosen, judged at eight instants through the longest turn of what turns. ponytail: a pass over every
 * system and a sort, once a view, in a chunk asked after it. */
export function deepOf(systems: readonly StarSystem[], view: RestView, judge: Judge): Deep[] {
  const { looks, balls, cards, lent } = judge;
  const [first] = looks;
  if (first === undefined) return [];
  const taken = new Set<number>([0, ...view.postcards, ...(view.close === undefined ? [] : [view.close.system])]);
  const holds = (system: StarSystem, world: Orbiter) => {
    const card = { system, worlds: [world] };
    const spins = [...cards, card].map(({ system: { spin } }) => spin).filter((spin) => spin !== 0);
    return (
      first.seen(lent.placeOf(system, world, 0), world.radius).radius >= LEAST &&
      looks.every((look, at) => clearOn(look, look.ball(system.place, world.orbit + world.radius), balls[at] ?? [])) &&
      lent.instantsOf(spins).every((seconds) => standsAt(judge, card, seconds)) &&
      !judge.rowDown([...cards, card])
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
    judge.spots.push(...spotsAt(judge, [{ system, worlds: [found.world] }], 0));
    cards.push({ system, worlds: [found.world] });
    bodies.push({ system: index, world: found.at });
  }
  return bodies;
}
