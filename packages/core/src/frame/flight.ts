// A flight's pure part (7g; ADR-0001 §7, "travel like a ship"; docs/DESIGN-SYSTEM.md, "Motion"): how long it takes by its distance, the
// phases the panel names, the panel's instruments, and where a flight to a star stops. The scene drives the way, eased by smootherstep:
// slowly out of orbit, across, slowly into the next.
import type { StarSystem } from "../cosmos/system.ts";
import type { Point } from "../space/cell.ts";
import { smootherstep, smoothstep } from "../space/smooth.ts";
import { onPlane, type InPlane } from "./disc.ts";

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
// A flight to a star stops 20 degrees off its system's plane, far enough to hold the whole system in view, near enough to read it.
const SLANT = (20 * Math.PI) / 180;
const STOP = { least: 6, most: 16, reach: 2.4 } as const;

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

/** Where a flight to `system`'s star from `from` stops, on the map, into `out`: round its star the way it came, 20 degrees off its plane on
 * the side it came from, as far as its worlds reach takes to hold them in view. */
export function arrivalOf(system: StarSystem, from: Point, out: { x: number; y: number; z: number }): void {
  const offset = { along: 0, across: 0, up: 0 };
  arrivalIn(system, from, offset);
  onPlane(system, offset, out);
}

/** The same stop in `system`'s own plane's terms, into `out`, for a caller that holds its own way onto the map (the flights' chunk takes
 * the cosmos's). */
export function arrivalIn(system: StarSystem, from: Point, out: InPlane): void {
  const reach = system.worlds.reduce((most, { orbit, radius }) => Math.max(most, orbit + radius), 0);
  const away = Math.min(STOP.most, Math.max(STOP.least, STOP.reach * reach));
  const { place, tilt, node } = system;
  const [x, y, z] = [from.x - place.x, from.y - place.y, from.z - place.z];
  const [cosNode, sinNode, cosTilt, sinTilt] = [Math.cos(node), Math.sin(node), Math.cos(tilt), Math.sin(tilt)];
  // The way it came in the plane's own terms, as onPlane reads them: along its line of nodes, across it, and up off it.
  const along = x * cosNode + z * sinNode;
  const across = -x * sinNode * cosTilt - y * sinTilt + z * cosNode * cosTilt;
  const up = -x * sinNode * sinTilt + y * cosTilt + z * cosNode * sinTilt;
  const round = Math.atan2(across, along);
  const level = away * Math.cos(SLANT);
  out.along = level * Math.cos(round);
  out.across = level * Math.sin(round);
  out.up = (up < 0 ? -1 : 1) * away * Math.sin(SLANT);
}
