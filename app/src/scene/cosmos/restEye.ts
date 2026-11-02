// Where the eye stands at rest among the worlds (slice 7d6): the view at rest's own eye, which the core placed from the data, about which the
// eye sways, and the camera that keeps the Earth at the canvas's centre, the disc's horizon level. Plain numbers: this chunk holds no three.
import { EARTH_PLACE, HOME, swayAt, toScene, type Point, type RestView } from "@gnoworld/core";
import type { PerspectiveCamera } from "three";

interface Spot {
  x: number;
  y: number;
  z: number;
}

const spot = (): Spot => ({ x: NaN, y: NaN, z: NaN });
const cross = (a: Spot, b: Spot, out: Spot) => {
  const [x, y, z] = [a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x];
  const length = Math.hypot(x, y, z);
  out.x = x / length;
  out.y = y / length;
  out.z = z / length;
};

export class RestEye {
  readonly #earth = spot();
  // The map's up, on the stage; from where the scene's eye rests (HOME) to the view at rest's; that view's axes, across and up.
  readonly #up = spot();
  readonly #offset = spot();
  readonly #across = spot();
  readonly #upward = spot();
  readonly #sway = { across: 0, up: 0 };

  constructor() {
    toScene(EARTH_PLACE, this.#earth);
    const [top, centre] = [spot(), spot()];
    toScene({ x: 0, y: 1, z: 0 }, top);
    toScene({ x: 0, y: 0, z: 0 }, centre);
    Object.assign(this.#up, { x: top.x - centre.x, y: top.y - centre.y, z: top.z - centre.z });
  }

  /** Takes the view at rest's eye. */
  rest({ eye }: RestView): void {
    toScene(eye, this.#offset);
    const ahead = {
      x: this.#earth.x - this.#offset.x,
      y: this.#earth.y - this.#offset.y,
      z: this.#earth.z - this.#offset.z,
    };
    this.#offset.x -= HOME.x;
    this.#offset.y -= HOME.y;
    this.#offset.z -= HOME.z;
    cross(ahead, this.#up, this.#across);
    cross(this.#across, ahead, this.#upward);
  }

  /** The eye `seconds` on, from the scene's `eye`, into `out`: the view at rest's, swayed. */
  place(eye: Point, seconds: number, out: Spot): void {
    swayAt(this.#sway, seconds);
    const { across, up } = this.#sway;
    out.x = eye.x + this.#offset.x + this.#across.x * across + this.#upward.x * up;
    out.y = eye.y + this.#offset.y + this.#across.y * across + this.#upward.y * up;
    out.z = eye.z + this.#offset.z + this.#across.z * across + this.#upward.z * up;
  }

  /** Turns `camera`, at the origin, the eye at `eye`, to the Earth. */
  aim(camera: PerspectiveCamera, eye: Point): void {
    camera.up.set(this.#up.x, this.#up.y, this.#up.z);
    camera.lookAt(this.#earth.x - eye.x, this.#earth.y - eye.y, this.#earth.z - eye.z);
    camera.updateMatrixWorld();
  }
}
