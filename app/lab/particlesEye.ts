// Where the study's eye stands (particles.ts): it looks between the Earth and the chosen clump, from the panel's pitch and yaw; at
// distance 0 it stands where the whole mass fills the view, the dive's start Alexis asked for.
import { Vector3, type PerspectiveCamera } from "three";
import type { Cluster } from "./particlesLayout.ts";
import { values } from "./particlesValues.ts";

// The mass's reach over the view's half height: a little under one, so it fills the screen.
const FILL = 0.82;

/** Stands `camera`, and gives the distances over which the mass's light falls: its nearest and its farthest from the eye. */
export function aim(camera: PerspectiveCamera, clusters: readonly Cluster[], target: Cluster | undefined) {
  const reach = clusters.reduce((most, { centre, radius }) => Math.max(most, centre.length() + radius), 1);
  const middle = new Vector3().lerp(target?.centre ?? new Vector3(), values.aim);
  const distance = values.distance > 0 ? values.distance : (FILL * reach) / Math.tan((camera.fov * Math.PI) / 360);
  const { pitch, yaw } = values;
  const back = new Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
  camera.position.copy(middle).addScaledVector(back, distance);
  camera.lookAt(middle);
  camera.updateMatrixWorld();
  const toMiddle = camera.position.length();
  return { near: Math.max(1, toMiddle - reach), far: toMiddle + reach };
}
