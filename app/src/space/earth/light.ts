// The Earth's real hour (D13947): the sun stands over the ground where it is noon now, so its direction is fixed in the Earth's own frame and
// turns with it, in both layers (the planet's never-stopping spin and the aim's lead and lean); the camera, the stars and the Moon stay.
import { EARTH, groundDirection, subSolarPoint } from "@gnoworld/core";
import type { Quaternion, Vector3 } from "three";
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

/** The Earth's day is the real one (D13947): the sun of the planet `drawn` over where it is noon now, as its group stands, `time` being its surface's
 * clock; any other world keeps its star. */
export function dayOf(
  drawn: Planet,
  { id, epochMs, time }: { id: string; epochMs: number; time: number },
  out: Vector3,
): void {
  if (id === EARTH) drawn.setSun(worldSun({ epochMs, angle: time * SPIN, group: drawn.group.quaternion }, out));
}
