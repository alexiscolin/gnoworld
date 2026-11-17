// A mark the ground holds (ground.ts): its ground's direction from the planet's middle, and on a colony the hull's point and normal it stands
// on, taken once a hull; and where a bubble can be read, clear of the page's edges.
import type { Vector3 } from "three";
import type { Vec } from "../layout.ts";
import type { GroundMark, Hull } from "./groundTypes.ts";

export interface Held {
  readonly mark: GroundMark;
  readonly ground: Vector3;
  readonly at: Vector3;
  readonly out: Vector3;
  on: Hull | undefined;
}

/** `mark` held, its ground's direction `ground`; its hull's point and normal kept till a hull gives them. */
export const heldOf = (mark: GroundMark, ground: Vector3): Held => ({
  mark,
  ground,
  at: ground.clone(),
  out: ground.clone(),
  on: undefined,
});

/** `hull`, its point and normal nearest `held`'s spot taken into `held` once a hull; none on a planet. */
export function takeHull(held: Held, hull: Hull | undefined): Hull | undefined {
  if (hull !== undefined && held.on !== hull) {
    hull.anchorFor(held.ground, held.at, held.out);
    held.on = hull;
  }
  return hull;
}

// The window's foot, as the page stands in a window; none where there is no window (the unit tests).
export const bottom = () => (typeof innerHeight === "number" ? innerHeight : Infinity);

// Whether the point `at` stands left of the bubble's dock, right of its plate and under its header, all by `margin`.
export function within({ x, y }: Vec, { keep, from }: GroundMark, margin: number): boolean {
  const [left, top] = [from?.x ?? -Infinity, from?.y ?? -Infinity];
  return keep !== undefined && x < keep - margin && x >= left + margin && y >= top + margin;
}
