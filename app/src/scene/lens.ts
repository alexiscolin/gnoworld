// A body stood in the circle a page keeps for it, the Earth's or a world's, and the lens every body is placed through: a lens shift and not a moved sphere, for off the axis a sphere's
// picture is no circle, and stands away from the one the page keeps.
import type { Object3D, PerspectiveCamera, Vector3 } from "three";
import type { Circle, EarthDevice } from "./earth/device.ts";

/** The screen, in the page's pixels. */
export interface Screen {
  width: number;
  height: number;
}

/** The lens's focal length, in the page's pixels, for a screen `height` high. */
export const focalOf = (camera: PerspectiveCamera, height: number): number =>
  height / 2 / Math.tan((camera.fov * Math.PI) / 360);

/** Shifts `camera`'s lens so the screen's middle falls on `circle`, and gives how far ahead a sphere of radius 1 fills it. */
export function standIn(camera: PerspectiveCamera, screen: Screen, circle: Circle): number {
  const { width, height } = screen;
  camera.setViewOffset(width, height, width / 2 - circle.x, height / 2 - circle.y, width, height);
  return Math.hypot(focalOf(camera, height) / circle.radius, 1);
}

/** Stands `group` at rest in `circle`, ahead of `camera` as far as `standIn` gives, that place written into `rest`. */
export function restIn(group: Object3D, rest: Vector3, { camera, screen, circle }: InCircle): void {
  rest.set(0, 0, -standIn(camera, screen, circle));
  group.position.copy(rest);
}

/** What stands a body in a page's circle: the eye, the screen and the circle. */
export interface InCircle {
  readonly camera: PerspectiveCamera;
  readonly screen: Screen;
  readonly circle: Circle;
}

/** What projects a point of the stage onto `screen`, in the page's pixels, through `camera`: made once, run on frames. */
export const projector =
  (camera: PerspectiveCamera, screen: Screen) =>
  (at: Vector3, into: Vector3): Vector3 => {
    into.copy(at).project(camera);
    return into.set(((into.x + 1) * screen.width) / 2, ((1 - into.y) * screen.height) / 2, into.z);
  };

/** Where a flight bringing a page's body at `rest` stands it, into `position`: farther along its ray by the arrival's approach, and to its
 * side by a share of its distance, negative to the left (7g); at `rest` with none. */
export function broughtTo(position: Vector3, rest: Vector3, arrival: EarthDevice["arrival"]): Vector3 {
  position.copy(rest).multiplyScalar(arrival?.approach ?? 1);
  position.x += (arrival?.aside ?? 0) * rest.length();
  return position;
}
