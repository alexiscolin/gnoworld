// How much of a halo a star keeps at a distance from the eye, in world units (7d6's halos; 7d3's arrival): whole to the first distance, a
// point of a few pixels by the second. One place for the scene, which draws them, and the arrival, which keeps them off a postcard.
import { smoothstep } from "../space/smooth.ts";

const HALO_NEAR = 40;
/** Past this a star is a point. */
export const HALO_FAR = 120;

/** The share of its halo a star keeps `distance` from the eye. */
export const haloAt = (distance: number): number => 1 - smoothstep(HALO_NEAR, HALO_FAR, distance);
