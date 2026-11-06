// A flight's pure part (7g; ADR-0001 §7, "travel like a ship"; docs/DESIGN-SYSTEM.md, "Motion"): how long it takes by its distance, the
// phases the panel names and the panel's instruments. The scene drives the way, eased by smootherstep: slowly out of orbit, across, slowly
// into the next. A flight to a star lands on its system's arrival, which core composes (arrival.ts, 7g2).
import { smootherstep, smoothstep } from "../space/smooth.ts";

/** Its timings, in seconds: the shortest and the longest flights (`--motion-scene`), and under reduced motion its crossfade (`--motion-base`). */
export const FLIGHT = { least: 1.3, most: 3.2, crossfade: 0.2 } as const;

/** What the panel says a flight is doing (ADR-0002 §1, "Flight panel"). */
export type FlightPhase = "leaving" | "transit" | "entering";

/** The panel's instruments: the distance left in AU, the speed in km/s, the time left in seconds. */
export interface Figures {
  distance: number;
  speed: number;
  eta: number;
}

// A neighbour's cell and the disc's breadth, in world units: the distances the shortest and the longest flights take.
const NEAR = 10;
const FAR = 1000;
// Where smootherstep's slope, 30 t² (1 - t)², is a third of its peak: (1 - √(1 - 4/√48)) / 2. Before it the eye leaves its orbit, past its
// mirror it enters the next.
const SETTLING = 0.1749424163281319;
// The panel's scales: the video's ranges (frames 18 to 142: 0.25 to 8 AU, up to 1,706 km/s), not physics.
const AU = 0.05;
const KM_S = 22;
// A progress read as the flight's: below its start, or none, is its start.
const progress = (along: number): number => (along > 0 ? Math.min(along, 1) : 0);

// The share of the way left, each half read from its own end: so it falls to its last digit, where 1 - smootherstep(by) climbs a digit
// near the end and smootherstep(1 - by) one near the start.
const leftOf = (by: number): number => (by <= 0.5 ? 1 - smootherstep(by) : smootherstep(1 - by));

/** Where a flight enters its next orbit: one whose place is not ready waits just before it, in transit. */
export const ENTERS = 1 - SETTLING;

/** How far along its way the eye is, `along` the flight's time: slowly out of orbit, across, slowly into the next. */
export const wayAt = (along: number): number => smootherstep(progress(along));

/** How long a flight of `distance` world units takes, by the log of the distance; the longest for a distance it cannot read. */
export function flightSeconds(distance: number): number {
  if (Number.isNaN(distance)) return FLIGHT.most;
  const by = smoothstep(Math.log(NEAR), Math.log(FAR), Math.log(Math.max(distance, NEAR)));
  return FLIGHT.least + (FLIGHT.most - FLIGHT.least) * by;
}

/** What the flight is doing `along` it, from 0 at its start to 1 at its end. */
export function phaseOf(along: number): FlightPhase {
  const by = progress(along);
  if (by < SETTLING) return "leaving";
  return by > 1 - SETTLING ? "entering" : "transit";
}

/** The panel's instruments `along` a flight of `distance` world units in `seconds`, into `out`. */
export function figuresOf(
  { distance, seconds }: { readonly distance: number; readonly seconds: number },
  along: number,
  out: Figures,
): void {
  const by = progress(along);
  out.distance = distance * leftOf(by) * AU;
  out.speed = (30 * by * by * (1 - by) * (1 - by) * distance * KM_S) / seconds;
  out.eta = seconds * (1 - by);
}
