// What the view at rest draws of the worlds (slice 7d6): its postcards' worlds and its close world as bodies, while each is large enough to
// tell from a point where the eye is (the ladder's rule), and as points the postcards' others; every other system is a distant star.
import {
  BODY_PIXELS,
  GRAIN,
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

/** The close world's system, by its index, as drawn wherever the eye stands: held still, so none of its worlds jumps to its orbit's place
 * as the ladder takes the view (7d9; Alexis, 2026-11-03, "la grosse planète à gauche disparaît si on bouge"). */
export interface CloseSystem {
  readonly index: number;
  readonly system: StarSystem;
}

/** The view's close world's system, held still. */
export function closeSystemOf(systems: readonly StarSystem[], { close }: RestView): CloseSystem | undefined {
  const system = close === undefined ? undefined : systems[close.system];
  return system === undefined || close === undefined
    ? undefined
    : { index: close.system, system: { ...system, spin: 0 } };
}

/** The view's bodies, from `eye` on the map with a lens of `focal` pixels: its postcards' and its close system's. */
export function restBodies(
  { postcards, still }: { postcards: ReadonlyMap<number, Postcard>; still: CloseSystem | undefined },
  sight: { eye: Point; focal: number },
): Wanted {
  const wanted = new Map<string, readonly [StarSystem, Orbiter]>();
  const offer = (system: StarSystem, world: Orbiter) => {
    if (world.radius < GRAIN) return;
    const { x, y, z } = system.place;
    const away = Math.hypot(x - sight.eye.x, y - sight.eye.y, z - sight.eye.z);
    if (screenRadius(world.radius, away, sight.focal) >= BODY_PIXELS) wanted.set(world.id, [system, world]);
  };
  // A postcard's bodies stand spread round its star, in its plane as drawn, from the eye at rest: the same view, the same spread. The
  // close world's system stands its worlds as the ladder would off the rest, so none changes as the eye leaves it.
  for (const { system, worlds } of postcards.values()) for (const world of worlds) offer(system, world);
  if (still !== undefined) for (const world of still.system.worlds) offer(still.system, world);
  return wanted;
}

/** Whether the view needs a system's halo, by its index: the great star's, first of the systems, and the postcards' stars'. */
export function haloNeeds({ postcards }: RestView): (system: number) => boolean {
  const kept = new Set([0, ...postcards]);
  return (system) => kept.has(system);
}

/** How large a system's worlds stand as points, by its index: whole for a postcard and for the close world's system, whose world is a
 * point until it is a body (7d9), a glint for any other. */
export function pointShares({ postcards, close }: RestView): (system: number) => number {
  const kept = new Set([...postcards, close?.system]);
  return (system) => (kept.has(system) ? 1 : GLINT);
}
