// The Earth and its Moon are hand-made, not generated (ADR-0002 §3): real maps, drawn as they are, through the planets' one shader. These looks
// hold no seed: nothing here warps, recolours or mixes a map.
import { Matrix3 } from "three";
import type { HandMade } from "../planet/uniforms.ts";

/** From the ground's frame (`groundDirection`) to the map's: the shader's lookup runs the east the other way, which a generated world never shows. */
export const GROUND_TO_MAP = new Matrix3().set(1, 0, 0, 0, 1, 0, 0, 0, -1);

const AS_DRAWN = {
  spin: [0, 0, 0],
  warp: { amount: 0, frequency: 1, offset: [0, 0, 0] },
  minorOffset: [0, 0, 0],
  ramp: [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ],
  recolour: 0,
  locked: false,
  sea: null,
  glow: null,
  rings: null,
} as const;

export const EARTH: HandMade = {
  ...AS_DRAWN,
  anchor: "temperate",
  map: "moon",
  tilt: -0.14,
  lean: 0.1,
  relief: 0,
  clouds: 0.34,
  highClouds: 0.22,
  rim: { colour: [0.2, 0.32, 0.54], thickness: 0.05 },
  // earth-height.webp: the shore is code 76 of 255; 5.5 km of land over 6371 km, five times exaggerated.
  height: { sea: 76 / 255, span: 0.0043 },
};

export const MOON: HandMade = {
  ...AS_DRAWN,
  anchor: "rocky",
  map: "moon",
  tilt: 0,
  lean: 0,
  relief: 0.02,
  clouds: 0,
  highClouds: 0,
  rim: null,
  // moon-height.webp: -9.2 to +10.9 km over 0 to 1, of 1737 km, three times exaggerated.
  height: { sea: 0, span: 0.035 },
};
