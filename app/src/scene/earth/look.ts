// The Earth and its Moon are hand-made, not generated (ADR-0002 §3): real maps, drawn as they are, through the planets' one shader. These looks
// hold no seed: nothing here warps, recolours or mixes a map.
import type { PlanetLook } from "@gnoworld/core";
import { Matrix3 } from "three";

/** From the ground's frame (`groundDirection`) to the map's: the shader's lookup runs the east the other way, which a generated world never shows. */
export const GROUND_TO_MAP = new Matrix3().set(1, 0, 0, 0, 1, 0, 0, 0, -1);

const AS_DRAWN = {
  second: null,
  secondShare: 0,
  spin: [0, 0, 0],
  warp: { amount: 0, frequency: 1, offset: [0, 0, 0] },
  ramp: [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ],
  recolour: 0,
  contrast: 1,
  caps: 0,
  rifts: 0,
  cracks: 0,
  locked: false,
  sea: null,
  glow: null,
  rings: null,
} as const;

export const EARTH: PlanetLook = {
  ...AS_DRAWN,
  anchor: "temperate",
  map: "moon",
  tilt: -0.14,
  lean: 0.1,
  relief: 0,
  clouds: 0.34,
  rim: { colour: [0.2, 0.32, 0.54], thickness: 0.05 },
};

export const MOON: PlanetLook = {
  ...AS_DRAWN,
  anchor: "rocky",
  map: "moon",
  tilt: 0,
  lean: 0,
  relief: 0.02,
  clouds: 0,
  rim: null,
};
