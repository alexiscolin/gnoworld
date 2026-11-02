// What the view at rest draws of the worlds (slice 7d6): its postcards' worlds and its close world as bodies, while each is large enough to
// tell from a point where the eye is (the ladder's rule), and as points the postcards' others; every other system is a distant star. A
// system's arrival (7d3) is such a view, of one postcard. Away from the view, the ladder's bodies.
import {
  BODY_PIXELS,
  GRAIN,
  type Drawn,
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
const WHOLE = () => 1;
const NO_PLANE = () => undefined;
const NONE_HIDDEN: ReadonlySet<string> = new Set();

/** A view as drawn: the view at rest's or a system's arrival, its postcards by their system's index, and its main light's system. */
export interface Shown {
  readonly view: RestView;
  readonly postcards: ReadonlyMap<number, Postcard>;
  readonly index: number;
}

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

/** The view's bodies, from `eye` on the map with a lens of `focal` pixels. */
function restBodies(
  systems: readonly StarSystem[],
  { view: { close }, postcards }: { view: RestView; postcards: ReadonlyMap<number, Postcard> },
  sight: { eye: Point; focal: number },
): Wanted {
  const wanted = new Map<string, readonly [StarSystem, Orbiter]>();
  const offer = (system: StarSystem | undefined, world: Orbiter | undefined) => {
    if (system === undefined || world === undefined || world.radius < GRAIN) return;
    const { x, y, z } = system.place;
    const away = Math.hypot(x - sight.eye.x, y - sight.eye.y, z - sight.eye.z);
    if (screenRadius(world.radius, away, sight.focal) >= BODY_PIXELS) wanted.set(world.id, [system, world]);
  };
  // A postcard's bodies stand spread round its star, in its plane as drawn, from the eye at rest: the same view, the same spread.
  for (const { system, worlds } of postcards.values()) for (const world of worlds) offer(system, world);
  if (close !== undefined) offer(systems[close.system], systems[close.system]?.worlds[close.world]);
  return wanted;
}

/** The close world's id, which holds its place at rest. */
const closeId = (systems: readonly StarSystem[], { close }: RestView): string | undefined =>
  close === undefined ? undefined : systems[close.system]?.worlds[close.world]?.id;

/** Whether the view needs a system's halo, by its index: the great star's, first of the systems, and the postcards' stars'. */
function haloNeeds({ postcards }: RestView): (system: number) => boolean {
  const kept = new Set([0, ...postcards]);
  return (system) => kept.has(system);
}

/** How large a system's worlds stand as points, by its index: whole for a postcard, none for the close world's system, whose rest is off
 * the screen, a glint for any other. */
function pointShares({ postcards, close }: RestView): (system: number) => number {
  const kept = new Set(postcards);
  return (system) => (kept.has(system) ? 1 : system === close?.system ? 0 : GLINT);
}

// Anywhere but at a view: the worlds the ladder stands as bodies, each large enough on screen to tell from a point, its others whole points.
function everywhere(systems: readonly StarSystem[], drawn: Drawn): Wanted {
  const wanted = new Map<string, readonly [StarSystem, Orbiter]>();
  for (let at = 0; at < drawn.bodyCount; at += 1) {
    const system = systems[drawn.bodySystems[at] ?? -1];
    const world = system?.worlds[drawn.bodyWorlds[at] ?? -1];
    if (system !== undefined && world !== undefined) wanted.set(world.id, [system, world]);
  }
  return wanted;
}

/** What is drawn from `sight`: `shown`'s bodies, close world, points, halos and planes where the eye rests at it (`resting`, on the map, the
 * eye less the arrival's glide and the sway), the ladder's `drawn` anywhere else; the main light's system, and the specks left out for
 * they would stand on a body (7d3). */
export function drawnFrom(
  systems: readonly StarSystem[],
  { shown, drawn }: { shown: Shown; drawn: Drawn },
  sight: { eye: Point; focal: number; resting: Point },
) {
  const { view, postcards, index: main } = shown;
  const [{ eye }, { resting }] = [view, sight];
  if (Math.hypot(resting.x - eye.x, resting.y - eye.y, resting.z - eye.z) > REST_REACH)
    return {
      bodies: everywhere(systems, drawn),
      close: undefined,
      pointShare: WHOLE,
      needsHalo: (system: number) => system === 0 || system === main,
      planeOf: NO_PLANE,
      main,
      hidden: NONE_HIDDEN,
    };
  return {
    bodies: restBodies(systems, { view, postcards }, sight),
    close: closeId(systems, view),
    pointShare: pointShares(view),
    needsHalo: haloNeeds(view),
    planeOf: (system: number) => postcards.get(system)?.system,
    main,
    hidden: new Set([...postcards.values()].flatMap(({ hidden }) => [...hidden])),
  };
}
