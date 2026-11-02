// The page's signs stand on the ground: a point of the Earth, and the HTML told where it stands on each frame the Earth moves (ADR-0001 §7, text
// is HTML). The sums are the shader's: `groundDirection`, the turn about the pole, then the globe's lean. Nothing is made on a frame.
import type { Screen as LensScreen } from "../lens.ts";
import { groundDirection, within } from "@gnoworld/core";
import type { LatLon } from "@gnoworld/core/bubbles";
import { Quaternion, Vector3, type Euler, type Group, type PerspectiveCamera } from "three";

export type { LatLon };

export interface GroundMark extends LatLon {
  /** Where it stands in the page's pixels, and whether the eye sees it clear of the limb. */
  readonly place: (x: number, y: number, front: boolean) => void;
}

/** What the page has of the Earth under it. */
export interface Ground {
  /** The marks to keep placed, in place of the last. */
  setMarks(marks: readonly GroundMark[]): void;
  /** The ground that faces the eye; none while no Earth stands. */
  facing(): LatLon | undefined;
  /** Turns the eye round the Earth to `place`, the sun staying over the ground: the place keeps its true hour. */
  face(place: LatLon): void;
}

/** Where the ground stands now: one object, written again on each frame. */
export interface Pose {
  turn: number;
  lean: Euler;
  centre: Vector3;
  scale: number;
}

/** Writes `pose` from a globe at `turn`, and gives it back. */
export function poseOf(pose: Pose, globe: { readonly lean: Euler; readonly group: Group }, turn: number): Pose {
  pose.turn = turn;
  pose.lean = globe.lean;
  pose.centre = globe.group.position;
  pose.scale = globe.group.scale.x;
  return pose;
}

export interface Screen extends LensScreen {
  readonly camera: PerspectiveCamera;
}

const DEGREE = Math.PI / 180;
const POLE = new Vector3(0, 1, 0);
// A sign this close to the limb would slide off the edge: the cosine of the eye's angle over the ground.
const CLEAR = 0.15;
const TURNING = 1.4;
// A little past the place's latitude, for the eye looks a bit above what it faces: frame 47 holds France 18 px under the disc's middle.
const LEAN_TO_PLACE = 1.08;

/** The cubic ease out of the Earth's moves. */
export const eased = (share: number): number => 1 - (1 - Math.min(share, 1)) ** 3;

export class GroundMarks {
  #held: readonly { mark: GroundMark; ground: Vector3 }[] = [];
  readonly #point = new Vector3();
  readonly #normal = new Vector3();
  readonly #tilt = new Quaternion();

  set(marks: readonly GroundMark[]): void {
    this.#held = marks.map((mark) => {
      const place = { latitude: mark.lat * DEGREE, longitude: mark.lon * DEGREE };
      return { mark, ground: new Vector3(...groundDirection(place)) };
    });
  }

  /** Tells each mark where it stands. */
  place({ turn, lean, centre, scale }: Pose, { width, height, camera }: Screen): void {
    for (const { mark, ground } of this.#held) {
      const normal = this.#normal.copy(ground).applyAxisAngle(POLE, -turn).applyEuler(lean);
      const point = this.#point.copy(normal).multiplyScalar(scale).add(centre);
      const front = -normal.dot(point) / point.length() > CLEAR;
      point.project(camera);
      mark.place(((point.x + 1) / 2) * width, ((1 - point.y) / 2) * height, front);
    }
  }

  /** The ground under the eye, in degrees: the eye sits at the origin. */
  facing({ turn, lean, centre }: Pose): LatLon {
    this.#tilt.setFromEuler(lean).invert();
    const { x, y, z } = this.#point
      .copy(centre)
      .negate()
      .normalize()
      .applyQuaternion(this.#tilt)
      .applyAxisAngle(POLE, turn);
    return { lat: Math.asin(y) / DEGREE, lon: Math.atan2(-z, x) / DEGREE };
  }
}

/** Where the eye has gone over the Earth: how far round it, and how far the pole leans to it, in radians. */
export class EyeTurn {
  readonly #restLean: number;
  #from = 0;
  #to = 0;
  #leanFrom: number;
  #leanTo: number;
  #began = Number.NEGATIVE_INFINITY;

  constructor(restLean: number) {
    this.#restLean = restLean;
    this.#leanFrom = restLean;
    this.#leanTo = restLean;
  }

  reset(): void {
    this.#from = 0;
    this.#to = 0;
    this.#leanFrom = this.#restLean;
    this.#leanTo = this.#restLean;
    this.#began = Number.NEGATIVE_INFINITY;
  }

  #share(age: number, still: boolean): number {
    return still ? 1 : eased((age - this.#began) / TURNING);
  }

  gone(age: number, still: boolean): number {
    return this.#from + (this.#to - this.#from) * this.#share(age, still);
  }

  lean(age: number, still: boolean): number {
    return this.#leanFrom + (this.#leanTo - this.#leanFrom) * this.#share(age, still);
  }

  busy(age: number): boolean {
    return age - this.#began < TURNING;
  }

  /** The lean that holds a place of latitude `lat` at the disc's middle. */
  leanFor = (lat: number): number => lat * DEGREE * LEAN_TO_PLACE;

  /** Goes `degrees` further round from where the eye is now, the short way, to the lean `leanFor` gave. */
  to({ degrees, lean }: { degrees: number; lean: number }, age: number, still: boolean): void {
    this.#from = this.gone(age, still);
    this.#leanFrom = this.lean(age, still);
    this.#to = this.#from + within(degrees * DEGREE);
    this.#leanTo = lean;
    this.#began = age;
  }
}
