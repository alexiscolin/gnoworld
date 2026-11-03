// A body stood in the circle a page keeps for it, the Earth's or a world's, and the lens every body is placed through: a lens shift and not a moved sphere, for off the axis a sphere's
// picture is no circle, and stands away from the one the page keeps.
import type { PerspectiveCamera, Vector3 } from "three";
import type { Circle } from "./earth/device.ts";

/** The screen, in the page's pixels. */
export interface Screen {
  width: number;
  height: number;
}

/** The lens's focal length, in the page's pixels, for a screen `height` high. */
export const focalOf = (camera: PerspectiveCamera, height: number): number =>
  height / 2 / Math.tan((camera.fov * Math.PI) / 360);

/** How wide a sphere of `radius`, `far` ahead through `camera`, stands on a screen `height` high: the radius of its disc, in its pixels. */
export const discOf = (
  camera: PerspectiveCamera,
  height: number,
  { far, radius }: { far: number; radius: number },
): number => (focalOf(camera, height) * radius) / Math.sqrt(Math.max(far * far - radius * radius, 1e-9));

/** Shifts `camera`'s lens so the screen's middle falls on `circle`, and gives how far ahead a sphere of radius 1 fills it. */
export function standIn(camera: PerspectiveCamera, screen: Screen, circle: Circle): number {
  const { width, height } = screen;
  camera.setViewOffset(width, height, width / 2 - circle.x, height / 2 - circle.y, width, height);
  return Math.hypot(focalOf(camera, height) / circle.radius, 1);
}

/** What projects a point of the stage onto `screen`, in the page's pixels, through `camera`: made once, run on frames. */
export const projector =
  (camera: PerspectiveCamera, screen: Screen) =>
  (at: Vector3, into: Vector3): Vector3 => {
    into.copy(at).project(camera);
    return into.set(((into.x + 1) * screen.width) / 2, ((1 - into.y) * screen.height) / 2, into.z);
  };
