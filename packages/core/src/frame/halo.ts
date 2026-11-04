// How much of a halo a star keeps at a distance from the eye, in world units (7d6's halos; 7d3's arrival): whole to the first distance, a
// point of a few pixels by the second; and how wide a sun stands, its halo shown. One place for the scene, which draws them, the arrival,
// which keeps them off a postcard, and the view at rest, which judges the glowing ones (7p2).
import type { StarSystem } from "../cosmos/system.ts";
import { distanceOf, type Point } from "../space/cell.ts";
import { smoothstep } from "../space/smooth.ts";

const HALO_NEAR = 40;
/** Past this a star is a point. */
export const HALO_FAR = 120;
// A star whose halo is three quarters whole or more glows, a second sun beside the main light (7d3).
const SECOND_SUN = 0.75;
/** A star's point, its radius on the screen in pixels. */
export const POINT_PIXELS = 10;
// The main light's halo at its widest on the screen: the great star's at the approved arrival, 36 units off, is 305 pixels.
const HALO_PIXELS = 320;
/** Every other sun stands half the great star's size on the screen at most. */
export const OTHER_SUN = 0.5;
// A star's reach on the map, from its size.
const REACH = 7.5;
const LEAST_REACH = 2;

/** The share of its halo a star keeps `distance` from the eye. */
export const haloAt = (distance: number): number => 1 - smoothstep(HALO_NEAR, HALO_FAR, distance);

/** Whether a star `distance` from the eye glows. */
export const glowsAt = (distance: number): boolean => haloAt(distance) >= SECOND_SUN;

const reachOf = ({ star }: Pick<StarSystem, "star">): number => REACH * Math.sqrt(star) + LEAST_REACH;

/** The main light's size on the screen from `eye`, through a lens of `focal` pixels: its reach over its distance, the widest halo kept;
 * none for no light. */
export const mainSizeOf = (main: StarSystem | undefined, eye: Point, focal: number): number =>
  main === undefined
    ? Infinity
    : Math.min(reachOf(main) / Math.max(distanceOf(main.place, eye), 1e-9), HALO_PIXELS / focal);

/** How a sun is seen: from `distance`, through a lens of `focal` pixels, `halo` of its halo shown, and for any but the main light the
 * share of the main light's size it stands under, `most`. */
export interface SunSight {
  distance: number;
  focal: number;
  halo: number;
  most?: number | undefined;
}

/** A sun's reach on the map, its halo shown over its point: the main light's own up to its widest, any other's eased under `most` times
 * its distance, so two suns at different distances never draw one size, the nearer the larger (the chief, 2026-11-03, after Alexis's
 * not-a-planetarium rule). */
export function sunReach(system: StarSystem, { distance, focal, halo, most }: SunSight): number {
  const own = reachOf(system);
  const full =
    most === undefined
      ? Math.min(own, (HALO_PIXELS * distance) / focal)
      : own / (1 + (own / (most * distance)) ** 4) ** 0.25;
  const point = Math.min(full, (POINT_PIXELS * distance) / focal);
  return point + (full - point) * halo;
}
