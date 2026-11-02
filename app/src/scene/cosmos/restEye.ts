// Where the eye stands at rest among the worlds (slice 7d6): the view at rest's own eye, which the core placed from the data, about which the
// eye sways, and the camera that keeps the Earth at the canvas's centre, the disc's horizon level; or, come to a system (7d3), its arrival's
// eye and what it looks at. Plain numbers: this chunk holds no three.
import {
  ARRIVAL_LEAN,
  EARTH_PLACE,
  HOME,
  LEAN,
  swayAt,
  toScene,
  type Point,
  type RestView,
  type StarSystem,
} from "@gnoworld/core";
import { landingAt, type Asking, type Landing } from "./restArrival.ts";
import type { PerspectiveCamera } from "three";

interface Spot {
  x: number;
  y: number;
  z: number;
}

const spot = (): Spot => ({ x: NaN, y: NaN, z: NaN });
// Less than this from where it last sent the eye, a new file's arrival moves nothing.
const MOVED = 1e-6;
const cross = (a: Spot, b: Spot, out: Spot) => {
  const [x, y, z] = [a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x];
  const length = Math.hypot(x, y, z);
  out.x = x / length;
  out.y = y / length;
  out.z = z / length;
};

export class RestEye {
  // What the camera looks at, on the stage: the Earth, or what the arrival looks at.
  readonly #target = spot();
  // The map's up, on the stage; from where the scene's eye rests (HOME) to the view at rest's; the axes the eye sways along, across and up.
  readonly #up = spot();
  readonly #rest = spot();
  readonly #offset = spot();
  readonly #across = spot();
  readonly #upward = spot();
  readonly #sway = { across: 0, up: 0 };
  #asked: Asking | undefined;
  #went: Point | undefined;
  // How much of the scene's eye's lean and glide off where it rests reaches the eye: all at home, half at an arrival, nearer what it sees.
  #lean = 1;

  constructor() {
    toScene(EARTH_PLACE, this.#target);
    const [top, centre] = [spot(), spot()];
    toScene({ x: 0, y: 1, z: 0 }, top);
    toScene({ x: 0, y: 0, z: 0 }, centre);
    Object.assign(this.#up, { x: top.x - centre.x, y: top.y - centre.y, z: top.z - centre.z });
  }

  // The sway's axes for an eye at `from` looking at the target, both on the stage.
  #face(from: Spot): void {
    const ahead = { x: this.#target.x - from.x, y: this.#target.y - from.y, z: this.#target.z - from.z };
    cross(ahead, this.#up, this.#across);
    cross(this.#across, ahead, this.#upward);
  }

  /** Takes the view at rest's eye. */
  rest({ eye }: RestView): void {
    toScene(eye, this.#rest);
    this.#offset.x = this.#rest.x - HOME.x;
    this.#offset.y = this.#rest.y - HOME.y;
    this.#offset.z = this.#rest.z - HOME.z;
    this.#face(this.#rest);
  }

  /** Comes to the system `asking` names among `systems`, or back to the view at rest with none or a name they do not hold: its landing,
   * what the eye looks at on the map, and whether the eye moved. `go` is told the scene's eye that stands it there, the view at rest's
   * way off it, unless it was told that already: a new file with the same arrival moves nothing. */
  arrive(systems: readonly StarSystem[], asking: Asking) {
    if (asking !== this.#asked) this.#went = undefined;
    this.#asked = asking;
    const landing = asking.id === undefined ? undefined : landingAt(systems, asking.id);
    const to = this.#land(landing);
    const went = this.#went;
    const moved = went === undefined || Math.hypot(to.x - went.x, to.y - went.y, to.z - went.z) >= MOVED;
    if (moved) {
      this.#went = to;
      asking.go(to);
    }
    return { landing, focus: landing?.look ?? EARTH_PLACE, moved };
  }

  // The camera turned to what `landing` looks at, or the Earth with none, the eye swaying along its own axes; the scene's eye there.
  #land(landing: Landing | undefined): Point {
    this.#lean = landing === undefined ? 1 : ARRIVAL_LEAN / LEAN;
    if (landing === undefined) {
      toScene(EARTH_PLACE, this.#target);
      this.#face(this.#rest);
      return HOME;
    }
    const at = spot();
    toScene(landing.view.eye, at);
    toScene(landing.look, this.#target);
    this.#face(at);
    return { x: at.x - this.#offset.x, y: at.y - this.#offset.y, z: at.z - this.#offset.z };
  }

  /** The eye `seconds` on, from the scene's `eye`, into `out`: the view at rest's, swayed. */
  place(eye: Point, seconds: number, out: Spot): void {
    swayAt(this.#sway, seconds);
    const { across, up } = this.#sway;
    const [rest, lean] = [this.#went ?? eye, this.#lean];
    out.x = rest.x + lean * (eye.x - rest.x) + this.#offset.x + this.#across.x * across + this.#upward.x * up;
    out.y = rest.y + lean * (eye.y - rest.y) + this.#offset.y + this.#across.y * across + this.#upward.y * up;
    out.z = rest.z + lean * (eye.z - rest.z) + this.#offset.z + this.#across.z * across + this.#upward.z * up;
  }

  /** Turns `camera`, at the origin, the eye at `eye`, to what it looks at. */
  aim(camera: PerspectiveCamera, eye: Point): void {
    camera.up.set(this.#up.x, this.#up.y, this.#up.z);
    camera.lookAt(this.#target.x - eye.x, this.#target.y - eye.y, this.#target.z - eye.z);
    camera.updateMatrixWorld();
  }
}
