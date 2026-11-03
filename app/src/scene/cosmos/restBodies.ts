// What the view at rest draws of the worlds (slice 7d6): its postcards' worlds and its close world as bodies, while each is large enough to
// tell from a point where the eye is (the ladder's rule), and as points the postcards' others; every other system is a distant star. A
// system's arrival (7d3) is such a view, of one postcard. Away from the view, the ladder's bodies.
import {
  BODY_PIXELS,
  distanceOf as away,
  drawnOf,
  EARTH_PLACE,
  easedOf,
  EARTH_RADIUS,
  GRAIN,
  smoothstep,
  type Deep,
  type Drawn,
  type Planned,
  type Rock,
  postcardOf,
  screenRadius,
  type Postcard,
  type Orbiter,
  type Point,
  type RestView,
  type StarSystem,
} from "@gnoworld/core";
import type { Wanted } from "./bodies.ts";

// A distant star's worlds glint, drawn as worlds of this share of their size, so they still fall with distance.
const GLINT = 0.12;
// The eye stands at the view within a mouse's lean (3 units each way, eye.ts) and its sway; away from it, the cosmos draws as anywhere
// (Alexis, 2026-11-02: depth everywhere).
const REST_REACH = 5;
const EASED_BY = 10 * REST_REACH;
const WHOLE = () => 1;
const NONE_HIDDEN: ReadonlySet<string> = new Set();

/** A view as drawn: the view at rest's or a system's arrival, its postcards by their system's index, its main light's system, and, once
 * found, the real worlds of other nearby systems the view at rest draws for depth and the home's rocks (7p), and the Earth's projects
 * where they stand clear (7v); a Plan's, for the labels' chunk to draw. */
export interface Shown {
  readonly view: RestView;
  readonly postcards: ReadonlyMap<number, Postcard>;
  readonly index: number;
  readonly deep?: readonly Deep[];
  readonly earth?: StarSystem | undefined;
  readonly rocks?: readonly Rock[];
  readonly plan?: Planned | undefined;
}

/** The close world's system, by its index, as drawn wherever the eye stands: held still, so none of its worlds jumps to its orbit's place
 * as the ladder takes the view (7d9; Alexis, 2026-11-03, "la grosse planète à gauche disparaît si on bouge"). */
interface Still {
  readonly index: number;
  readonly system: StarSystem;
}

const stillOf = (systems: readonly StarSystem[], { close }: RestView): Still | undefined => {
  const system = close === undefined ? undefined : systems[close.system];
  return system === undefined || close === undefined
    ? undefined
    : { index: close.system, system: { ...system, spin: 0 } };
};

// A star with no halo standing behind the Earth, its point a few pixels off the limb, reads as a glitch on it (the chief, 2026-11-03): it
// fades out there. The camera looks at the Earth, so a place's distance on screen from its centre is the lens times its angle's tangent.
const LIMB_GONE = 5;
const LIMB_CLEAR = 10;

/** How much of a halo-less star's point at a place on the map shows past the Earth's limb, from `eye` through a lens of `focal` pixels. */
export const limbOf =
  ({ eye, focal }: { eye: Point; focal: number }) =>
  (place: Point): number => {
    const [star, earth] = [away(place, eye), away(EARTH_PLACE, eye)];
    const along =
      (place.x - eye.x) * (EARTH_PLACE.x - eye.x) +
      (place.y - eye.y) * (EARTH_PLACE.y - eye.y) +
      (place.z - eye.z) * (EARTH_PLACE.z - eye.z);
    const cosine = along / (star * earth);
    if (star <= earth || cosine <= 0) return 1;
    const offCentre = (focal * Math.sqrt(Math.max(1 - cosine * cosine, 0))) / cosine;
    return smoothstep(LIMB_GONE, LIMB_CLEAR, offCentre - (EARTH_RADIUS * focal) / earth);
  };

/** The view's postcards as drawn, by their system's index: each laid out once, from the eye at rest. */
export const postcardsOf = (
  systems: readonly StarSystem[],
  { eye, postcards }: RestView,
): ReadonlyMap<number, Postcard> =>
  new Map(
    postcards.flatMap((index) => {
      const system = systems[index];
      return system === undefined ? [] : [[index, postcardOf(system, eye)] as const];
    }),
  );

// Each postcard's worlds, at their drawn size, judged by their own: a world's own size is its system's, for a Plan draws its worlds at a
// map's scale (7v), a postcard at its own; the Earth's projects stand in no system of the file. ponytail: a Plan's twelve looked up among
// its system's worlds, 200 at most a system.
function offerPostcards(
  systems: readonly StarSystem[],
  postcards: ReadonlyMap<number, Postcard>,
  offer: (system: StarSystem, world: Orbiter, own?: number) => void,
): void {
  for (const [index, card] of postcards) {
    const owned = new Map(systems[index]?.worlds.map((world) => [world.id, world.radius]));
    drawnOf(card).forEach((world, at) => {
      offer(card.system, world, owned.get(world.id) ?? card.worlds[at]?.radius);
    });
  }
}

/** The view's bodies, from `eye` on the map with a lens of `focal` pixels: its postcards', its close world's system's, its depth's, and the
 * Earth's projects that stand clear (7v). */
function restBodies(
  systems: readonly StarSystem[],
  {
    postcards,
    still,
    deep,
    earth,
  }: {
    postcards: ReadonlyMap<number, Postcard>;
    still: Still | undefined;
    deep: readonly Deep[];
    earth: StarSystem | undefined;
  },
  sight: { eye: Point; focal: number },
): Wanted {
  const wanted = new Map<string, readonly [StarSystem, Orbiter]>();
  // A world too small for a body is a speck by its own size, whatever a postcard draws it at (7p).
  const offer = (system: StarSystem, world: Orbiter, own = world.radius) => {
    if (own < GRAIN) return;
    const { x, y, z } = system.place;
    const away = Math.hypot(x - sight.eye.x, y - sight.eye.y, z - sight.eye.z);
    if (screenRadius(world.radius, away, sight.focal) >= BODY_PIXELS) wanted.set(world.id, [system, world]);
  };
  // A postcard's bodies stand spread round its star, in its plane as drawn, each at its drawn size (7p), from the eye at rest: the same
  // view, the same spread. The close world's system stands its worlds as the ladder would off the rest, so none changes as the eye leaves it.
  offerPostcards(systems, postcards, offer);
  if (still !== undefined) for (const world of still.system.worlds) offer(still.system, world);
  for (const { system, world } of deep) {
    const held = systems[system];
    const own = held?.worlds[world];
    if (held !== undefined && own !== undefined) offer(held, own);
  }
  if (earth !== undefined) for (const world of earth.worlds) offer(earth, world);
  return wanted;
}

/** Whether the view needs a system's halo, by its index: the great star's, first of the systems, and the postcards' stars'. */
function haloNeeds({ postcards }: RestView): (system: number) => boolean {
  const kept = new Set([0, ...postcards]);
  return (system) => kept.has(system);
}

/** How large a system's worlds stand as points, by its index: whole for a postcard and for the close world's system, whose world is a
 * point until it is a body (7d9), a glint for any other. */
function pointShares({ postcards, close }: RestView): (system: number) => number {
  const kept = new Set([...postcards, close?.system]);
  return (system) => (kept.has(system) ? 1 : GLINT);
}

// A postcard's world as drawn, at its share of its size; another, or one the postcard leaves out, at its own.
const asDrawn = (card: Postcard | undefined, world: Orbiter): Orbiter =>
  card === undefined ? world : (drawnOf(card)[card.worlds.findIndex(({ id }) => id === world.id)] ?? world);

// The view's systems as drawn, by their index: the close world's held still, each postcard's plane as drawn (7d9, 7p); none for another.
const planesOf = (postcards: ReadonlyMap<number, Postcard>, still: Still | undefined) => (system: number) =>
  postcards.get(system)?.system ?? (system === still?.index ? still.system : undefined);

// Off the rest, `back` of the way from the view's drawing to the ladder's: each postcard eased back to its own system (7p's review).
const easedFrom = (systems: readonly StarSystem[], postcards: ReadonlyMap<number, Postcard>, back: number) =>
  back >= 1
    ? new Map<number, Postcard>()
    : new Map(
        [...postcards].map(([index, card]) => [index, easedOf(card, systems[index] ?? card.system, back)] as const),
      );

// Anywhere but at a view: the worlds the ladder stands as bodies, each large enough on screen to tell from a point, its others whole points;
// the close world's system held still, and the postcards as `postcards` draws them, so none jumps as the eye leaves it.
function everywhere(
  systems: readonly StarSystem[],
  drawn: Drawn,
  { still, postcards }: { still: Still | undefined; postcards: ReadonlyMap<number, Postcard> },
): Wanted {
  const wanted = new Map<string, readonly [StarSystem, Orbiter]>();
  const planeOf = planesOf(postcards, still);
  for (let at = 0; at < drawn.bodyCount; at += 1) {
    const index = drawn.bodySystems[at] ?? -1;
    const system = planeOf(index) ?? systems[index];
    const world = system?.worlds[drawn.bodyWorlds[at] ?? -1];
    if (system !== undefined && world !== undefined)
      wanted.set(world.id, [system, asDrawn(postcards.get(index), world)]);
  }
  return wanted;
}

/** What is drawn from `sight`: `shown`'s bodies, points, halos and planes where the eye rests at it (`resting`, the eye less the glide and
 * the sway), the ladder's `drawn` elsewhere, the close world held still and the postcards as drawn in both (7d9, 7p); the main light, the
 * specks left out for they would stand on a body, and whether the bodies are lit as up close, as at a system's arrival (7d3). */
export function drawnFrom(
  systems: readonly StarSystem[],
  { shown, drawn }: { shown: Shown; drawn: Drawn },
  sight: { eye: Point; focal: number; resting: Point },
) {
  const { view, postcards, index: main, deep = [], earth } = shown;
  // The rocks stand in space wherever the eye is, for the labels' chunk to draw (7p), and a Plan's ellipses and names (7v).
  drawn.rocks = shown.rocks ?? [];
  drawn.plan = shown.plan;
  const [{ eye }, { resting }] = [view, sight];
  const still = stillOf(systems, view);
  // At an arrival its own star alone is needed: any other keeps the halo its distance leaves it.
  const lead = (system: number) => system === main;
  const off = Math.hypot(resting.x - eye.x, resting.y - eye.y, resting.z - eye.z);
  if (off > REST_REACH) {
    // Off the rest, the postcards ease back to their own over ten times its reach: the eye can cross it by units in one step (7d9's walk).
    const eased = easedFrom(systems, postcards, smoothstep(REST_REACH, EASED_BY, off));
    return {
      bodies: everywhere(systems, drawn, { still, postcards: eased }),
      pointShare: WHOLE,
      needsHalo: lead,
      planeOf: planesOf(eased, still),
      still: still?.index,
      limb: limbOf(sight),
      main,
      hidden: NONE_HIDDEN,
      near: false,
    };
  }
  return {
    bodies: restBodies(systems, { postcards, still, deep, earth }, sight),
    pointShare: pointShares(view),
    needsHalo: main === 0 ? haloNeeds(view) : lead,
    planeOf: planesOf(postcards, still),
    still: still?.index,
    limb: limbOf(sight),
    main,
    hidden: new Set([...postcards.values()].flatMap(({ hidden }) => [...hidden])),
    near: main !== 0,
  };
}
