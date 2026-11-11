// The page's signs stand on the page planet's ground (ADR-0001 §7, text is HTML): a point of it by its latitude and longitude, and the
// HTML told where it stands on each frame. The sums are the surface shader's (planet/surfaceShader.ts): the ground's direction turned back
// about the pole by the planet's own turn, then its lean and tilt (planet.ts), its size and its place. Nothing is made on a frame.
import { EARTH as EARTH_ID, groundDirection } from "@gnoworld/core";
import type { LatLon } from "@gnoworld/core/bubbles";
import { Euler, Quaternion, Vector3 } from "three";
import { placeOf, type Planet, type Vec } from "../layout.ts";
import { SPIN } from "../planet/surfaceShader.ts";
import { AIM_STEP, bestPair } from "./aim.ts";
import { turned } from "./light.ts";
import { EARTH } from "./look.ts";
import { Spring } from "./spring.ts";

export type { LatLon };

export interface GroundMark extends LatLon {
  /** Where it stands in the page's pixels, and whether the eye sees it clear of the limb. */
  readonly place: (x: number, y: number, front: boolean) => void;
  /** A bubble's: the page's x it must stand left of to be read (the dock's edge); the newest turns the Earth to it (D488). */
  readonly keep?: number | undefined;
  /** Where its country should stand when it is brought into view: the free area's point Alexis's frames keep it at (signMarks.ts). */
  readonly aim?: { readonly x: number; readonly y: number } | undefined;
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
}

/** The eye that sees the Earth: where it stands, and where a point stands on screen (false off it). */
export interface Eye {
  readonly eye: Vec;
  project(at: Vec, out: Vec): boolean;
}

const DEGREE = Math.PI / 180;
// A sign this close to the limb would slide off the edge: the cosine of the eye's angle over the ground.
const CLEAR = 0.15;
// A point is well seen when its ground faces the eye within about 56 degrees (the cosine), and stands this far, in pixels, from the plate's,
// the header's, the dock's and the window's edges: Japan squeezed on the limb, at 75 degrees, was "seen" and not read (Alexis, 2026-11-11).
const WELL = 0.55;
const MARGIN = 60;
// raw: a turn's speed is capped, in radians a second, for the spin and for the lean (spring.ts)
const MOST_SPIN = 1.5;
const MOST_TILT = 1;

// The window's foot, as the page stands in a window; none where there is no window (the unit tests).
const bottom = () => (typeof innerHeight === "number" ? innerHeight : Infinity);

// Whether the point `at` stands left of the bubble's dock, right of its plate and under its header, all by `margin`.
function within({ x, y }: Vec, { keep, from }: GroundMark, margin: number): boolean {
  const [left, top] = [from?.x ?? -Infinity, from?.y ?? -Infinity];
  return keep !== undefined && x < keep - margin && x >= left + margin && y >= top + margin;
}

export class EarthGround {
  #held: readonly { mark: GroundMark; ground: Vector3 }[] = [];
  readonly #normal = new Vector3();
  readonly #point = new Vector3();
  readonly #centre = new Vector3();
  readonly #on: Vec = { x: 0, y: 0, z: 0 };
  readonly #spin = new Spring();
  readonly #lean = new Spring();
  // The axis the planet leans about (the eye's right when the lean began), and the lean as a turn of the world.
  readonly #axis = new Vector3(1, 0, 0);
  readonly #leaned = new Quaternion();
  #cosine = 0;
  #radius = 1;
  #hidden = false;
  #newest: { mark: GroundMark; ground: Vector3 } | undefined;
  // The newest bubble judged: the planet's own spin when its aim was made (made again when it has moved a few degrees), and whether its country has been well seen since.
  #aimed: { mark: GroundMark; spin: number; seen: boolean } | undefined;
  #id = "";
  // The lead each world left with, to start from when its page comes again: a world's angle never jumps with its page.
  readonly #left = new Map<string, number>();
  readonly #axisOf: (id: string) => Axis;
  readonly #still: () => boolean;
  #base = new Quaternion().setFromEuler(new Euler(EARTH.lean, 0, EARTH.tilt));
  #back = this.#base.clone().invert();
  readonly #undo = new Quaternion();

  /** `axisOf` gives another world's axis; `still`, under reduced motion, has the turn made at once, not eased. */
  constructor(axisOf: (id: string) => Axis, still: () => boolean) {
    this.#axisOf = axisOf;
    this.#still = still;
  }

  /** The ground turned past the Earth's own spin, in radians (D488): its shader, its signs and its facing all take it. */
  get lead(): number {
    return this.#spin.at;
  }

  set lead(angle: number) {
    this.#spin.jump(angle);
  }

  /** How far the planet leans toward the eye, in radians (D13916); and that lean as a turn of the world, for its group. */
  get lean(): number {
    return this.#lean.at;
  }

  get leaned(): Quaternion {
    return this.#leaned;
  }

  /** Whether the planet is still turning to show a bubble: the loop stays awake while it does. */
  get turning(): boolean {
    return this.#spin.moving || this.#lean.moving;
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

  // The axis a lean turns the pole about so it comes straight to the eye (or goes away from it): across the pole and the way to the eye.
  #axisFor(eye: Vec): void {
    const pole = this.#point.set(0, 1, 0).applyQuaternion(this.#base);
    const toEye = this.#normal.set(eye.x - this.#centre.x, eye.y - this.#centre.y, eye.z - this.#centre.z);
    this.#axis.crossVectors(pole, toEye);
    if (this.#axis.lengthSq() < 1e-9) this.#axis.set(1, 0, 0);
    this.#axis.normalize();
  }

  // The lean `angle` about `#axis`, kept as a turn of the world.
  #leanBy(angle: number): void {
    this.#leaned.setFromAxisAngle(this.#axis, angle);
  }

  // The world's direction from the planet's middle of the ground `ground`, into `out`, the world turned by `angle`.
  #normalOf(ground: Vector3, angle: number, out: Vector3): Vector3 {
    return turned(out.copy(ground), -angle).applyQuaternion(this.#base).applyQuaternion(this.#leaned);
  }

  // Where `ground` stands on screen, left in `#on`, the world turned by `angle`; whether the eye sees it clear of the limb and on screen.
  #stands(ground: Vector3, angle: number, seen: Eye): boolean {
    const { eye } = seen;
    const normal = this.#normalOf(ground, angle, this.#normal);
    const point = this.#point.copy(normal).multiplyScalar(this.#radius).add(this.#centre);
    const away = Math.hypot(eye.x - point.x, eye.y - point.y, eye.z - point.z) || 1;
    this.#cosine = (normal.x * (eye.x - point.x) + normal.y * (eye.y - point.y) + normal.z * (eye.z - point.z)) / away;
    return seen.project(point, this.#on) && this.#cosine > CLEAR;
  }

  // Whether the bubble `mark` stands, as `#on` has it, where it can be read; `well`, also facing the eye and clear of the window's foot.
  #readable(mark: GroundMark, well: boolean): boolean {
    const margin = well ? MARGIN : 0;
    const open = within(this.#on, mark, margin);
    return open && (!well || (this.#cosine >= WELL && this.#on.y <= bottom() - MARGIN));
  }

  // A planet other than the last starts with the lead it left with (none the first time) and no lean, standing as its own axis says.
  #stand(planet: Planet): void {
    if (planet.id === this.#id) return;
    this.#left.set(this.#id, this.lead);
    this.#id = planet.id;
    this.#spin.jump(this.#left.get(planet.id) ?? 0);
    this.#lean.jump(0);
    this.#leanBy(0);
    this.#aimed = undefined;
    const { lean, tilt } = planet.id === EARTH_ID ? EARTH : this.#axisOf(planet.id);
    this.#base.setFromEuler(new Euler(lean, 0, tilt));
    this.#back.copy(this.#base).invert();
  }

  /** Tells each mark where it stands on `earth` (the page's planet), `seconds` on, as `seen` sees it: the planet turned first, so the marks and
   * the surface the shader draws with it agree on the same frame. */
  place(earth: Planet, { seconds, step }: { seconds: number; step: number }, seen: Eye): void {
    this.#stand(earth);
    placeOf(earth, seconds, this.#centre);
    this.#radius = earth.radius;
    // The newest bubble is the last: whether it stands where none can read it, past the limb, under the dock, the plate or the header.
    this.#newest = this.#held.findLast(({ mark }) => mark.keep !== undefined);
    const held = this.#newest;
    this.#hidden =
      held !== undefined &&
      !(this.#stands(held.ground, seconds * SPIN + this.lead, seen) && this.#readable(held.mark, true));
    this.#turn(seen, seconds, step);
    for (const { mark, ground } of this.#held) {
      const front = this.#stands(ground, seconds * SPIN + this.lead, seen);
      mark.place(this.#on.x, this.#on.y, front);
    }
  }

  /** A page's planet that is not at rest on its page (a flight to it, from it, its arrival): its bubbles never turn it, and its lean eases
   * back to rest by `step` seconds, so no flight leaves with a lean (D13916). */
  rest(earth: Planet, step: number): void {
    this.#stand(earth);
    this.#lean.to = 0;
    this.#advance(step, false);
  }

  // The newest bubble not well seen turns the planet, the short way, eased (Alexis, 2026-11-11), to where its country stands in the free area; with
  // none the aim holds; with reduced motion at once.
  #turn(seen: Eye, seconds: number, step: number): void {
    const held = this.#newest;
    // An aim goes on, following the planet's own spin, until its country has been well seen; then it stays, whatever the spin does to the
    // country after (D13946), and with no bubble left nothing eases back.
    if (held !== undefined) {
      if (held.mark !== this.#aimed?.mark) this.#aimed = { mark: held.mark, spin: NaN, seen: false };
      this.#aimed.seen ||= !this.#hidden;
      if (!this.#aimed.seen) this.#aim(held, seen, seconds);
    }
    this.#advance(step, true);
  }

  // The spin and the lean a step on; `spun`, the spin too (it stands still while the planet is not at rest on its page).
  #advance(step: number, spun: boolean): void {
    if (this.#still()) {
      if (spun) this.#spin.jump(this.#spin.to);
      this.#lean.jump(this.#lean.to);
    } else {
      if (spun) this.#spin.advance(step, MOST_SPIN);
      this.#lean.advance(step, MOST_TILT);
    }
    this.#leanBy(this.#lean.at);
  }

  // The pair of spin and lean that shows the newest bubble's country in the free area, by the shortest turn (aim.ts): once per bubble, and again
  // when the planet's own spin has moved it a few degrees.
  #aim(held: { mark: GroundMark; ground: Vector3 }, seen: Eye, seconds: number): void {
    const turn = seconds * SPIN;
    if (this.#aimed?.mark === held.mark && Math.abs(this.#aimed.spin - turn) < AIM_STEP) return;
    this.#aimed = { mark: held.mark, spin: turn, seen: false };
    if (!this.#lean.moving && this.#lean.at === 0) this.#axisFor(seen.eye);
    const probe = (lead: number, lean: number) => {
      this.#leanBy(lean);
      if (!this.#stands(held.ground, turn + lead, seen)) return undefined;
      return {
        at: this.#on,
        cosine: this.#cosine,
        well: this.#readable(held.mark, true),
        shown: this.#readable(held.mark, false),
      };
    };
    const best = bestPair(probe, { lead: this.lead, lean: this.lean }, held.mark.aim);
    this.#leanBy(this.#lean.at);
    if (best === undefined) return;
    this.#spin.to = best.lead;
    this.#lean.to = best.lean;
  }

  /** The ground of `earth` under `eye`, `seconds` on, in degrees. */
  facing(earth: Planet, seconds: number, eye: Vec): LatLon {
    const at = placeOf(earth, seconds, this.#centre);
    const local = turned(
      this.#point
        .set(eye.x - at.x, eye.y - at.y, eye.z - at.z)
        .normalize()
        .applyQuaternion(this.#undo.copy(this.#leaned).invert())
        .applyQuaternion(this.#back),
      seconds * SPIN + this.lead,
    );
    return { lat: Math.asin(local.y) / DEGREE, lon: Math.atan2(-local.z, local.x) / DEGREE };
  }
}
