// What the view at rest draws of the worlds (slice 7d6): its postcards' worlds and its close world as bodies, while each is large enough to
// tell from a point where the eye is (the ladder's rule), and as points the postcards' others; every other system is a distant star.
import {
  BODY_PIXELS,
  GRAIN,
  postcardOf,
  screenRadius,
  type Orbiter,
  type Point,
  type RestView,
  type StarSystem,
} from "@gnoworld/core";
import type { Wanted } from "./bodies.ts";

// A distant star's worlds glint, drawn as worlds of this share of their size, so they still fall with distance.
const GLINT = 0.12;

/** The view's bodies, from `eye` on the map with a lens of `focal` pixels. */
export function restBodies(
  systems: readonly StarSystem[],
  { eye, postcards, close }: RestView,
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
  for (const index of postcards) {
    const system = systems[index];
    const postcard = system === undefined ? undefined : postcardOf(system, eye);
    for (const world of postcard?.worlds ?? []) offer(postcard?.system, world);
  }
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
