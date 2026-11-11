// What each moon slot holds (D490): its room, its drawn world and how far it has come in, and where its orbit lies.
import { smoothstep } from "@gnoworld/core";
import type { Planet as Drawn } from "../planet/planet.ts";

export interface Slot {
  room: string;
  rate: number;
  drawn: Drawn | undefined;
  ready: boolean;
  alpha: number;
  flare: number;
  leaving: boolean;
}

// raw: orbits in the planet's radii (the first on the page's ring), their lean out of the ring's plane, the foreground moon's pace in
// radians a second (a turn in two minutes), a moon's size in radii from quiet to busy, and the busy rate
export const ORBITS = [1.25, 1.7, 2.1, 2.6] as const;
export const LEANS = [0, 0.35, -0.5, 0.25] as const;
const PACE = 0.052;
const SIZE = [0.07, 0.17] as const;
const BUSY = 20;

export const emptySlot = (): Slot => ({
  room: "",
  rate: 0,
  drawn: undefined,
  ready: false,
  alpha: 0,
  flare: 0,
  leaving: false,
});

/** A moon's size in the planet's radii: the log of its room's rate, a quiet room still showing. */
export const sizeOf = (rate: number): number =>
  SIZE[0] + (SIZE[1] - SIZE[0]) * Math.min(1, Math.log1p(rate) / Math.log1p(BUSY));

/** Moon `at`'s angle on its orbit, from the start `spin`; the others slower and against the first, held under reduced motion. */
export const angleOf = (at: number, spin: number, { seconds, still }: { seconds: number; still: boolean }): number =>
  spin + (at * 1.9 + 0.4 * at * at) + (still ? 0 : (PACE / (1 + at * 0.6)) * seconds) * (at % 2 === 0 ? 1 : -1);

/** How much of a moon shows (D521): all of it on the near half of its orbit, none as it nears the planet's limb from behind, so it never
 * looks cut by the limb or sunk into the ground. `depth` is its distance behind (negative) or before the planet's middle, `across` its
 * distance from the line of sight through it, both in the planet's radius `radius`, `size` the moon's. */
export const showOf = (depth: number, across: number, { radius, size }: { radius: number; size: number }): number =>
  1 - smoothstep(0, 0.35 * radius, -depth) * (1 - smoothstep(radius + size, radius * 1.25 + size, across));

/** The Earth's own room: its moon is the real Moon, hand-made (look.ts). */
export const EARTH_ROOM = "#earth";
