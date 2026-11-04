// A station's parts (part 7x; Alexis, 2026-11-04, "Avant la démo"): what the generator joins, each a plain shape the scene draws instanced,
// one draw a kind for every station at once. A part stands in the station's own frame, its spine up (+y), in the station's reach.
import type { Point } from "../space/cell.ts";

/** The unit shapes a station is joined from, scaled by a part's `size` across, along its axis and through: a closed cylinder, a ball, a
 * thin torus and an open cylinder (a habitat's wall) round the axis, a box (a panel is thin through), a bowl opening along the axis, and a
 * small ball that glows. */
export const PART_KINDS = ["module", "sphere", "ring", "band", "truss", "panel", "dish", "beacon"] as const;
export type PartKind = (typeof PART_KINDS)[number];

/** What a part is covered with: the scene gives each a colour; a light glows. */
export type Finish = "hull" | "pale" | "dark" | "gold" | "cells" | "lamp";

export interface Part {
  readonly kind: PartKind;
  readonly finish: Finish;
  /** Its centre, in the station's frame. */
  readonly at: Point;
  /** Where its own axis points, a unit vector, and where its face looks (its thin side's way), square to the axis; any where none. */
  readonly axis: Point;
  readonly face?: Point;
  readonly size: Point;
  /** Whether it turns with the station's wheel, round the spine: a ring and its spokes. */
  readonly wheel: boolean;
}

export const UP: Point = { x: 0, y: 1, z: 0 };

/** A unit vector at `angle` round the spine, level. */
export const round = (angle: number): Point => ({ x: Math.cos(angle), y: 0, z: Math.sin(angle) });

export const plus = (a: Point, b: Point, by = 1): Point => ({
  x: a.x + b.x * by,
  y: a.y + b.y * by,
  z: a.z + b.z * by,
});

export const at = (x: number, y: number, z: number): Point => ({ x, y, z });

/** How far a part reaches from the station's centre at the most: its centre's distance and its own longest half. */
export function reachOf({ at: centre, size, kind }: Part): number {
  const boxed = kind === "module" || kind === "truss" || kind === "panel";
  const own = boxed ? Math.hypot(size.x, size.y, size.z) : kind === "band" ? Math.hypot(size.x, size.y) : 1.1 * size.x;
  return Math.hypot(centre.x, centre.y, centre.z) + own;
}

/** Every part scaled by `by` about the station's centre. */
export const scaled = (parts: readonly Part[], by: number): Part[] =>
  parts.map((part) => ({
    ...part,
    at: { x: part.at.x * by, y: part.at.y * by, z: part.at.z * by },
    size: { x: part.size.x * by, y: part.size.y * by, z: part.size.z * by },
  }));
