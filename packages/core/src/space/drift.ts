// The worlds' clock and the place the eye rests at on arrival (ADR-0002 §10): pure, for the same second is the same place.
import type { Point } from "./cell.ts";

/** Where the eye rests on arrival: of the spots tried, an amber cloud right of the middle, and near-black under the hero. */
export const HOME: Point = { x: 3300, y: 4100, z: -2200 };

// The pace the worlds turn at among the stars, a share of their spin: slow, so the near worlds slide past the far ones more than any turns
// (7d6).
const ORBIT_PACE = 0.2;

/** The clock every world turns by, bodies and points alike, `seconds` after the arrival: one place, so a world that becomes a body keeps
 * its place on its orbit. */
export const orbitTime = (seconds: number): number => seconds * ORBIT_PACE;
