// The Earth's real hour (D13947): the sun stands over the ground where it is noon now, so its direction is fixed in the Earth's own frame and
// turns with it, in both layers (the planet's never-stopping spin and the aim's lead and lean); the camera, the stars and the Moon stay.
import { EARTH, groundDirection, subSolarPoint } from "@gnoworld/core";
import { Quaternion, Vector3 } from "three";
import type { Planet } from "../planet/planet.ts";
import { SPIN } from "../planet/surfaceShader.ts";

/** `v` turned about the pole by `angle`, as the shader's `turned` (planet/surfaceParts.ts). */
export function turned(v: Vector3, angle: number): Vector3 {
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  return v.set(c * v.x + s * v.z, v.y, c * v.z - s * v.x);
}

export interface Turn {
  readonly epochMs: number;
  readonly angle: number;
  readonly group: Quaternion;
}

/** Into `out`, the world's direction of the sun from the Earth at `epochMs`: its ground turned by `angle` (the spin and the lead) and carried
 * by the planet's group `group` (the lean and the axis). */
export function worldSun({ epochMs, angle, group }: Turn, out: Vector3): Vector3 {
  const [x, y, z] = groundDirection(subSolarPoint(epochMs));
  return turned(out.set(x, y, z), -angle).applyQuaternion(group);
}

const [star, ground, inverse] = [new Vector3(), new Vector3(), new Quaternion()];
let held = 0;
/** The turn dayOf has added to the Earth's own spin on its page, in radians: whatever draws or places the ground takes it too. */
export const kept = (): number => held;
const wrap = (a: number): number => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));

/** The Earth's real day (D13947) on its page (`page` 1); where its star is drawn (`page` 0) the star lights it and its noon faces the star
 * (D13002), both blended between. `out`: the star's direction in, the Earth's sun out; the result is the time to turn the ground by. Any
 * other world keeps its star and its time. */
export function dayOf(
  drawn: Planet,
  { id, epochMs, time, page }: { id: string; epochMs: number; time: number; page: number },
  out: Vector3,
): number {
  if (id !== EARTH) return time;
  star.copy(out);
  const [x, , z] = groundDirection(subSolarPoint(epochMs));
  ground.copy(star).applyQuaternion(inverse.copy(drawn.group.quaternion).invert());
  // turned(g, -a) has the angle of g plus a about the pole, so the star's own angle less the noon ground's is the angle that faces it.
  const facing = Math.atan2(ground.z, ground.x) - Math.atan2(z, x);
  const toward = wrap(facing - time * SPIN);
  // Where the sun is drawn the ground follows the real hour; as a page comes it keeps the turn it had (the spin goes on from there), so a dive
  // in turns nothing; a dive out turns it back to the hour (the short way).
  if (page < 0.01) held = toward;
  const angle = time * SPIN + (1 - page) * toward + page * held;
  worldSun({ epochMs, angle, group: drawn.group.quaternion }, out);
  out.lerp(star, 1 - page).normalize();
  drawn.setSun(out);
  return angle / SPIN;
}
