import { WANDER } from "./rig/free.ts";
import type { Space } from "./scene.ts";

// The slow turn at rest: none on a page, on the home's Earth (D459: it would turn its light away) or under reduced motion; far
// out the galaxy's own (not the Map's); else the one near a system.
function wanderOf(space: Space, still: boolean): (typeof WANDER)[keyof typeof WANDER] {
  if (still || space.place?.kind === "world" || space.arrival) return WANDER.none;
  return space.place?.kind === "universe" && !space.plan ? WANDER.galaxy : WANDER.near;
}

// What the reader's hand does here: the slow turn, a level turn on the Map's systems, the wheel's anchor, and the galaxy's own view
// turning round its core (the origin), not round the point it looks at (a system's star is what its view looks at already).
export function handOf(space: Space, still: boolean): void {
  const { free } = space.rig;
  free.wander = wanderOf(space, still);
  free.level = space.plan && space.place?.kind !== "universe";
  free.pointed = space.place?.kind === "universe";
  free.pivot.x = free.pointed && !space.plan ? 0 : NaN;
  free.pivot.y = free.pivot.z = 0;
}
