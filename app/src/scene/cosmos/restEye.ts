// Where the eye stands at rest among the worlds (slice 7d6): the view at rest's own eye, which the core placed from the data, about which the
// eye sways, and the camera that keeps the Earth at the canvas's centre, the disc's horizon level. Plain numbers: this chunk holds no three.
import { EARTH_PLACE, HOME, swayAt, toMap, toScene, type Point, type RestView } from "@gnoworld/core";
import type { PerspectiveCamera } from "three";
import type { EarthDevice } from "../earth/device.ts";

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
  readonly #device: Pick<EarthDevice, "eye">;
  readonly #focus = spot();
  #flown = false;

  /** On `device`, whose eye a flight may turn to a star (7g). */
  constructor(device: Pick<EarthDevice, "eye">) {
    this.#device = device;
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

  /** Turns `camera`, at the origin, the eye at `eye`, to the Earth, or to what a flight looks at (7g). */
  aim(camera: PerspectiveCamera, eye: Point): void {
    const flown = this.#device.eye?.look;
    const look = flown ?? this.#earth;
    this.#flown = flown !== undefined;
    if (flown !== undefined) toMap(flown, this.#focus);
    camera.up.set(this.#up.x, this.#up.y, this.#up.z);
    camera.lookAt(look.x - eye.x, look.y - eye.y, look.z - eye.z);
    camera.updateMatrixWorld();
  }

  /** What the eye looks at, on the map, round which the ladder stands bodies: the Earth, or the star a flight looks at (7g). */
  get focus(): Point {
    return this.#flown ? this.#focus : EARTH_PLACE;
  }
}
