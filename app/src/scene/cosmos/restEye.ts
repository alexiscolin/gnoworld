// Where the eye stands at rest among the worlds (slice 7d6): the view at rest's own eye, which the core placed from the data, about which the
// eye sways, and the camera that keeps the Earth at the canvas's centre, the disc's horizon level; or, come to a system (7d3), its arrival's
// eye and what it looks at; or what a flight looks at while it does (7g). Plain numbers: this chunk holds no three.
import {
  ARRIVAL_LEAN,
  EARTH_PLACE,
  HOME,
  LEAN,
  swayAt,
  toMap,
  toScene,
  type Point,
  type RestView,
  type StarSystem,
} from "@gnoworld/core";
import type { Asking, Landing } from "./restArrival.ts";
import type { PerspectiveCamera } from "three";
import type { EarthDevice } from "../earth/device.ts";

// A system's arrival is looked for in a chunk of its own, asked the first time a system is: the view at rest's stays within its cap; so are
// the Plans, a system's and the Earth's, in one of their own (7v).
const loadArrival = () => import("./restArrival.ts");
const loadPlan = () => import("./restPlan.ts");

interface Spot {
  x: number;
  y: number;
  z: number;
}

const spot = (): Spot => ({ x: NaN, y: NaN, z: NaN });
type Room = NonNullable<Landing["room"]>;
const WHOLE: Room = { right: 1, left: 1, up: 1, down: 1 };
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
  /** What the camera looks at, on the stage: the Earth, or what the arrival looks at. */
  readonly looked = spot();
  /** The arrival it came to, drawn in place of the view at rest; none at rest. */
  landing: Landing | undefined;
  // The map's up, on the stage; from where the scene's eye rests (HOME) to the view at rest's; the axes the eye sways along, across and up.
  readonly #up = spot();
  readonly #rest = spot();
  readonly #offset = spot();
  readonly #across = spot();
  readonly #upward = spot();
  readonly #sway = { across: 0, up: 0 };
  #asked: Asking | undefined;
  #went: Point | undefined;
  #turn = 0;
  // How much of the scene's eye's lean and glide off where it rests reaches the eye: all at home, less at a landing, nearer what it sees.
  #lean = 1;
  #room: Room = WHOLE;
  // The same on the map; and what a flight looks at, on the map, while it does.
  #arrived: Point = EARTH_PLACE;
  readonly #device: Pick<EarthDevice, "eye">;
  readonly #flownFocus = spot();
  #flown = false;

  /** On `device`, whose eye a flight may turn to a star (7g). */
  constructor(device: Pick<EarthDevice, "eye">) {
    this.#device = device;
    toScene(EARTH_PLACE, this.looked);
    this.#upFor(undefined);
  }

  // The camera's up on the stage: a Plan's plane's own, so no tilt of its system rolls its orbits (7v's design review, F4470), else the map's.
  #upFor(landing: Landing | undefined): void {
    const [top, centre] = [spot(), spot()];
    toScene(landing?.up ?? { x: 0, y: 1, z: 0 }, top);
    toScene({ x: 0, y: 0, z: 0 }, centre);
    Object.assign(this.#up, { x: top.x - centre.x, y: top.y - centre.y, z: top.z - centre.z });
  }

  // The sway's axes for an eye at `from` looking at the target, both on the stage.
  #face(from: Spot): void {
    const ahead = { x: this.looked.x - from.x, y: this.looked.y - from.y, z: this.looked.z - from.z };
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

  /** Comes to what `asking` names among `systems` once its chunk came, in its Plan where asked (the Earth's at rest, 7v), or back to the
   * view at rest; a later ask wins. `came` is told the scene's eye there, unless it was told that already: a new file with the same arrival
   * moves nothing. A chunk that does not come leaves the eye where it is. */
  arrive(systems: readonly StarSystem[], asking: Asking, came: (asking: Asking, to: Point) => void): void {
    this.#turn += 1;
    const [turn, { id, plan }] = [this.#turn, asking];
    const landed = (landing: Landing | undefined) => {
      if (turn === this.#turn) this.#come(asking, landing, came);
    };
    if (plan)
      loadPlan().then(
        ({ planAt }) => {
          landed(planAt(systems, id));
        },
        () => undefined,
      );
    else if (id === undefined) this.#come(asking, undefined, came);
    else
      loadArrival().then(
        ({ landingAt }) => {
          landed(landingAt(systems, id));
        },
        () => undefined,
      );
  }

  #come(asking: Asking, landing: Landing | undefined, came: (asking: Asking, to: Point) => void): void {
    if (asking !== this.#asked) this.#went = undefined;
    this.#asked = asking;
    this.landing = landing;
    this.#arrived = landing?.look ?? EARTH_PLACE;
    const [to, went] = [this.#land(landing), this.#went];
    if (went !== undefined && Math.hypot(to.x - went.x, to.y - went.y, to.z - went.z) < MOVED) return;
    this.#went = to;
    came(asking, to);
  }

  // The camera turned to what `landing` looks at, or the Earth with none, the eye swaying along its own axes; the scene's eye there.
  #land(landing: Landing | undefined): Point {
    this.#lean = landing === undefined ? 1 : (landing.lean ?? ARRIVAL_LEAN) / LEAN;
    this.#room = landing?.room ?? WHOLE;
    this.#upFor(landing);
    if (landing === undefined) {
      toScene(EARTH_PLACE, this.looked);
      this.#face(this.#rest);
      return HOME;
    }
    const at = spot();
    toScene(landing.view.eye, at);
    toScene(landing.look, this.looked);
    this.#face(at);
    return { x: at.x - this.#offset.x, y: at.y - this.#offset.y, z: at.z - this.#offset.z };
  }

  /** The eye `seconds` on, from the scene's `eye`, into `out`: the view at rest's, swayed. */
  place(eye: Point, seconds: number, out: Spot): void {
    swayAt(this.#sway, seconds);
    const { across, up } = this.#sway;
    const [rest, lean, room] = [this.#went ?? eye, this.#lean, this.#room];
    // Each way across and up the stage as far as the view's room says (the design review's second pass, F4468).
    const [leanX, leanY] = [eye.x >= rest.x ? room.right : room.left, eye.y >= rest.y ? room.up : room.down];
    out.x = rest.x + lean * leanX * (eye.x - rest.x) + this.#offset.x + this.#across.x * across + this.#upward.x * up;
    out.y = rest.y + lean * leanY * (eye.y - rest.y) + this.#offset.y + this.#across.y * across + this.#upward.y * up;
    out.z = rest.z + lean * (eye.z - rest.z) + this.#offset.z + this.#across.z * across + this.#upward.z * up;
  }

  /** Turns `camera`, at the origin, the eye at `eye`, to what it looks at, or to what a flight does (7g). */
  aim(camera: PerspectiveCamera, eye: Point): void {
    const flown = this.#device.eye?.look;
    const look = flown ?? this.looked;
    this.#flown = flown !== undefined;
    if (flown !== undefined) toMap(flown, this.#flownFocus);
    camera.up.set(this.#up.x, this.#up.y, this.#up.z);
    camera.lookAt(look.x - eye.x, look.y - eye.y, look.z - eye.z);
    camera.updateMatrixWorld();
  }

  /** What the eye looks at, on the map, round which the ladder stands bodies: the Earth, a system's arrival's, or the star a flight looks
   * at (7g). */
  get focus(): Point {
    return this.#flown ? this.#flownFocus : this.#arrived;
  }
}
