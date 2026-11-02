// A body stood in the circle a page keeps for it, the Earth's or a world's: a lens shift and not a moved sphere, for off the axis a sphere's
// picture is no circle, and stands away from the one the page keeps.
import type { PerspectiveCamera } from "three";
import type { Circle } from "./device.ts";

/** The screen, in the page's pixels. */
export interface Screen {
  width: number;
  height: number;
}

/** The lens's focal length, in the page's pixels. */
export const focalOf = (camera: PerspectiveCamera, { height }: Screen): number =>
  height / 2 / Math.tan((camera.fov * Math.PI) / 360);

/** Shifts `camera`'s lens so the screen's middle falls on `circle`, and gives how far ahead a sphere of radius 1 fills it. */
export function standIn(camera: PerspectiveCamera, screen: Screen, circle: Circle): number {
  const { width, height } = screen;
  camera.setViewOffset(width, height, width / 2 - circle.x, height / 2 - circle.y, width, height);
  return Math.hypot(focalOf(camera, screen) / circle.radius, 1);
}
