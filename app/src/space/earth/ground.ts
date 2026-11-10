// The page's signs stand on the page planet's ground (ADR-0001 §7, text is HTML): a point of it by its latitude and longitude, and the
// HTML told where it stands on each frame. The sums are the surface shader's (planet/surfaceShader.ts): the ground's direction turned back
// about the pole by the planet's own turn, then its lean and tilt (planet.ts), its size and its place. Nothing is made on a frame.
import { EARTH as EARTH_ID, groundDirection } from "@gnoworld/core";
import type { LatLon } from "@gnoworld/core/bubbles";
import { Euler, Quaternion, Vector3 } from "three";
import { placeOf, type Planet, type Vec } from "../layout.ts";
import { SPIN } from "../planet/surfaceShader.ts";
import type { Goal } from "../rig/flight.ts";
import { blankPose, copyPose, copySpot, type Pose } from "../rig/pose.ts";
import { EARTH } from "./look.ts";

export type { LatLon };

export interface GroundMark extends LatLon {
  /** Where it stands in the page's pixels, and whether the eye sees it clear of the limb. */
  readonly place: (x: number, y: number, front: boolean) => void;
  /** A bubble's: the page's x it must stand left of to be read (the dock's edge); the newest turns the Earth to it (D488). */
  readonly keep?: number | undefined;
  /** A world's bubble: the page's point it must stand right of and under (the plate's edge, the header's), or the newest turns the world (D565). */
  readonly from?: { readonly x: number; readonly y: number } | undefined;
}

/** How a planet's axis stands: its lean and tilt, as its group is turned (planet.ts). */
export interface Axis {
  readonly lean: number;
  readonly tilt: number;
}

/** What the page has of the Earth under it. */
export interface Ground {
  /** The marks to keep placed, in place of the last. */
  setMarks(marks: readonly GroundMark[]): void;
  /** The ground that faces the eye; none while no Earth stands. */
  facing(): LatLon | undefined;
  /** Turns the eye round the Earth to `place`. */
  face(place: LatLon): void;
}

/** The eye that sees the Earth: where it stands, and where a point stands on screen (false off it). */
export interface Eye {
  readonly eye: Vec;
  project(at: Vec, out: Vec): boolean;
}

const DEGREE = Math.PI / 180;
// A sign this close to the limb would slide off the edge: the cosine of the eye's angle over the ground.
const CLEAR = 0.15;
// raw: the ease that carries a turn on to bring a bubble out, in seconds, a step to read which way, and the leads tried round, 10 degrees apart
const EASE_S = 0.5;
const PROBE = 0.05;
const AIM_STEP = Math.PI / 18;
const AIM_STEPS = 36;

// `v` turned about the pole by `angle`, as the shader's `turned` (planet/surfaceParts.ts).
function turned(v: Vector3, angle: number): Vector3 {
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  return v.set(c * v.x + s * v.z, v.y, c * v.z - s * v.x);
}

export class EarthGround {
  #held: readonly { mark: GroundMark; ground: Vector3 }[] = [];
  readonly #normal = new Vector3();
  readonly #point = new Vector3();
  readonly #centre = new Vector3();
  readonly #on: Vec = { x: 0, y: 0, z: 0 };
  readonly #probe = new Vector3();
  /** The ground turned past the Earth's own spin, in radians (D488): its shader, its signs and its facing all take it. */
  lead = 0;
  #leadTo = 0;
  #last = 0;
  #radius = 1;
  #hidden = false;
  #newest: { mark: GroundMark; ground: Vector3 } | undefined;
  #id = "";
  // The lead each world left with, to start from when its page comes again: a world's angle never jumps with its page.
  readonly #left = new Map<string, number>();
  readonly #axisOf: (id: string) => Axis;
  readonly #still: () => boolean;
  #lean = new Quaternion().setFromEuler(new Euler(EARTH.lean, 0, EARTH.tilt));
  #back = this.#lean.clone().invert();

  /** `axisOf` gives another world's axis; `still`, under reduced motion, has the turn made at once, not eased. */
  constructor(axisOf: (id: string) => Axis, still: () => boolean) {
    this.#axisOf = axisOf;
    this.#still = still;
  }

  /** The lead in seconds of the planet's spin, as its surface's clock takes it. */
  get ahead(): number {
    return this.lead / SPIN;
  }

  setMarks(marks: readonly GroundMark[]): void {
    this.#held = marks.map((mark) => ({
      mark,
      ground: new Vector3(...groundDirection({ latitude: mark.lat * DEGREE, longitude: mark.lon * DEGREE })),
    }));
  }

  // The world's direction from the planet's middle of the ground `ground`, into `out`, the world turned by `angle`.
  #normalOf(ground: Vector3, angle: number, out: Vector3): Vector3 {
    return turned(out.copy(ground), -angle).applyQuaternion(this.#lean);
  }

  // Where `ground` stands on screen, left in `#on`, the world turned by `angle`; whether the eye sees it clear of the limb and on screen.
  #stands(ground: Vector3, angle: number, seen: Eye): boolean {
    const { eye } = seen;
    const normal = this.#normalOf(ground, angle, this.#normal);
    const point = this.#point.copy(normal).multiplyScalar(this.#radius).add(this.#centre);
    const away = Math.hypot(eye.x - point.x, eye.y - point.y, eye.z - point.z) || 1;
    const front =
      (normal.x * (eye.x - point.x) + normal.y * (eye.y - point.y) + normal.z * (eye.z - point.z)) / away > CLEAR;
    return seen.project(point, this.#on) && front;
  }

  // Whether the bubble `mark` stands, as `#on` has it, where it can be read: left of the dock, right of the plate, under the header.
  #readable({ keep, from }: GroundMark): boolean {
    const { x, y } = this.#on;
    return keep !== undefined && x < keep && x >= (from?.x ?? -Infinity) && y >= (from?.y ?? -Infinity);
  }

  // A planet other than the last starts with the lead it left with (none the first time), standing as its own axis says.
  #stand(planet: Planet): void {
    if (planet.id === this.#id) return;
    this.#left.set(this.#id, this.lead);
    this.#id = planet.id;
    this.lead = this.#leadTo = this.#left.get(planet.id) ?? 0;
    const { lean, tilt } = planet.id === EARTH_ID ? EARTH : this.#axisOf(planet.id);
    this.#lean.setFromEuler(new Euler(lean, 0, tilt));
    this.#back.copy(this.#lean).invert();
  }

  /** Tells each mark where it stands on `earth` (the page's planet), `seconds` on, as `seen` sees it. */
  place(earth: Planet, seconds: number, seen: Eye): void {
    this.#stand(earth);
    placeOf(earth, seconds, this.#centre);
    this.#radius = earth.radius;
    this.#hidden = false;
    this.#newest = undefined;
    for (const held of this.#held) {
      const front = this.#stands(held.ground, seconds * SPIN + this.lead, seen);
      held.mark.place(this.#on.x, this.#on.y, front);
      // The newest bubble is the last: whether it stands where none can read it, past the limb, under the dock, the plate or the header.
      if (held.mark.keep === undefined) continue;
      this.#newest = held;
      this.#hidden = !(front && this.#readable(held.mark));
    }
    this.#turn(seen, seconds);
  }

  // While the newest bubble cannot be read the planet turns on, the way that carries the ground left, eased (Alexis, 2026-11-09), to the
  // nearest lead that shows it; with reduced motion at once.
  #turn(seen: Eye, seconds: number): void {
    const step = Math.min(Math.max(seconds - this.#last, 0), 0.1);
    this.#last = seconds;
    if (this.#hidden) this.#aim(seen, seconds);
    this.lead = this.#still() ? this.#leadTo : this.lead + (this.#leadTo - this.lead) * (1 - Math.exp(-step / EASE_S));
  }

  // The first lead on from the aimed one where the newest bubble stands readable, a step either side of it too, so it stays so.
  #aim(seen: Eye, seconds: number): void {
    const held = this.#newest;
    if (held === undefined) return;
    const way = this.#leftward(seen);
    const readable = (lead: number) =>
      this.#stands(held.ground, seconds * SPIN + lead, seen) && this.#readable(held.mark);
    for (let at = 0; at <= AIM_STEPS; at += 1) {
      const lead = this.#leadTo + way * at * AIM_STEP;
      if (!readable(lead) || !readable(lead + AIM_STEP) || !readable(lead - AIM_STEP)) continue;
      this.#leadTo = lead;
      return;
    }
  }

  // +1 where a turn on (a larger lead) moves the ground under the eye left on screen, else -1.
  #leftward(seen: Eye): number {
    const [centre, n] = [this.#centre, this.#probe];
    n.set(seen.eye.x - centre.x, seen.eye.y - centre.y, seen.eye.z - centre.z).normalize();
    seen.project(this.#point.copy(n).multiplyScalar(this.#radius).add(centre), this.#on);
    const before = this.#on.x;
    turned(n.applyQuaternion(this.#back), -PROBE).applyQuaternion(this.#lean);
    seen.project(this.#point.copy(n).multiplyScalar(this.#radius).add(centre), this.#on);
    return this.#on.x < before ? 1 : -1;
  }

  /** The ground of `earth` under `eye`, `seconds` on, in degrees. */
  facing(earth: Planet, seconds: number, eye: Vec): LatLon {
    const at = placeOf(earth, seconds, this.#centre);
    const local = turned(
      this.#point
        .set(eye.x - at.x, eye.y - at.y, eye.z - at.z)
        .normalize()
        .applyQuaternion(this.#back),
      seconds * SPIN + this.lead,
    );
    return { lat: Math.asin(local.y) / DEGREE, lon: Math.atan2(-local.z, local.x) / DEGREE };
  }

  /** A turn of the eye from `pose` round `earth` to face `place`, as far off as it stands, the Earth met where it is each frame. */
  faceGoal(place: LatLon, { earth, seconds }: { earth: Planet; seconds: () => number }, pose: Pose): Goal {
    const ground = new Vector3(...groundDirection({ latitude: place.lat * DEGREE, longitude: place.lon * DEGREE }));
    const way = this.#normalOf(ground, seconds() * SPIN + this.lead, new Vector3());
    const start = copyPose(pose, blankPose());
    return {
      turn: true,
      pose: (out) => {
        copyPose(start, out);
        placeOf(earth, seconds(), out.look);
        copySpot(way, out.way);
        return true;
      },
    };
  }
}
