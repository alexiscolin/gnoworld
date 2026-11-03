// What the view at rest draws of the worlds (slice 7d6): its postcards' worlds and its close world as bodies, while each is large enough to
// tell from a point where the eye is (the ladder's rule), and as points the postcards' others; every other system is a distant star.
import {
  BODY_PIXELS,
  GRAIN,
  postcardOf,
  screenRadius,
  type Postcard,
  type Orbiter,
  type Drawn,
  type Point,
  type RestView,
  type StarSystem,
} from "@gnoworld/core";
import type { Wanted } from "./bodies.ts";
import { GREAT_STAR } from "./halos.ts";

// A distant star's worlds glint, drawn as worlds of this share of their size, so they still fall with distance.
const GLINT = 0.12;

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
export function restBodies(
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
export const closeId = (systems: readonly StarSystem[], { close }: RestView): string | undefined =>
  close === undefined ? undefined : systems[close.system]?.worlds[close.world]?.id;

/** Whether the view needs a system's halo, by its index: the great star's, first of the systems, and the postcards' stars'. */
export function haloNeeds({ postcards }: RestView): (system: number) => boolean {
  const kept = new Set([0, ...postcards]);
  return (system) => kept.has(system);
}

/** How large a system's worlds stand as points, by its index: whole for a postcard, none for the close world's system, whose rest is off
 * the screen, a glint for any other. */
export function pointShares({ postcards, close }: RestView): (system: number) => number {
  const kept = new Set(postcards);
  return (system) => (kept.has(system) ? 1 : system === close?.system ? 0 : GLINT);
}

const WHOLE = () => 1;
const NO_PLANE = () => undefined;

/** What the cosmos draws anywhere but at rest (Alexis, 2026-11-02: depth everywhere): the worlds the ladder stands as bodies, each large
 * enough on screen to tell from a point, its others whole points. Here, with the view at rest's code, for it runs only once that came. */
export function everywhere(
  systems: readonly StarSystem[],
  drawn: Drawn,
): {
  bodies: Wanted;
  close: undefined;
  pointShare: () => number;
  needsHalo: (system: number) => boolean;
  planeOf: () => undefined;
} {
  const bodies = new Map<string, readonly [StarSystem, StarSystem["worlds"][number]]>();
  for (let at = 0; at < drawn.bodyCount; at += 1) {
    const system = systems[drawn.bodySystems[at] ?? -1];
    const world = system?.worlds[drawn.bodyWorlds[at] ?? -1];
    if (system !== undefined && world !== undefined) bodies.set(world.id, [system, world]);
  }
  return { bodies, close: undefined, pointShare: WHOLE, needsHalo: GREAT_STAR, planeOf: NO_PLANE };
}
