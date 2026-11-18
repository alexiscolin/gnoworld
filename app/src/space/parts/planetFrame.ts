// The frame a planet turns in, as the scene draws it: its look's lean and tilt, its lean toward the eye, its spin led ahead; the arrival's
// scan stands in it (move.ts), so no grid changes its tilt in one frame.
import { EARTH } from "@gnoworld/core";
import { Euler, Quaternion, Vector3 } from "three";
import { EARTH as EARTH_LOOK } from "../earth/look.ts";
import type { Planet } from "../layout.ts";
import { worldOf } from "../planet/generated.ts";
import { SPIN } from "../planet/surfaceShader.ts";

const AXIS = new Euler();
const SPUN = new Quaternion();
const Y = new Vector3(0, 1, 0);

const lookOf = (planet: Planet) => (planet.id === EARTH ? EARTH_LOOK : worldOf(planet.id).look);

/** The frame `planet` turns in (its lean toward the eye over its look, its spin led by `ahead`), into `out`. */
export function frameOf(
  planet: Planet,
  { seconds, leaned, ahead = 0 }: { seconds: number; leaned?: Quaternion | undefined; ahead?: number },
  out: Quaternion,
): Quaternion {
  const { lean, tilt } = lookOf(planet);
  out.setFromEuler(AXIS.set(lean, 0, tilt));
  if (leaned !== undefined) out.premultiply(leaned);
  return out.multiply(SPUN.setFromAxisAngle(Y, -(seconds + ahead) * SPIN));
}
