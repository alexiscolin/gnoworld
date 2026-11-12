// Whether a frame would differ from the last one drawn (P102): the loop still moves the scene each frame, and draws it only when this
// says so. "full": something moves by the hand, an ease or a change told; "ambient": only the camera's slow turn or a slow orbit has
// crossed half a pixel; "none": nothing a pixel could show.
export type Need = "full" | "ambient" | "none";

/** What a frame is made of, read after it moved. */
export interface Moment {
  /** The camera's position, then its orientation (a unit quaternion). */
  readonly eye: readonly number[];
  /** Every other number the frame is drawn from: the lens, the size, each uniform that eases (shown.ts). */
  readonly shown: readonly number[];
  /** Radians a pixel, and how far the camera stands from what it looks at. */
  readonly pxK: number;
  readonly distance: number;
  readonly seconds: number;
  /** The pixels a second the fastest slow motion of the scene moves. */
  readonly pxPerSecond: number;
  /** A flight, the hand, an effect, a planet framed close: each frame differs. */
  readonly moving: boolean;
}

const HALF_PIXEL = 0.5;
// An eased value within this share of its size (never less than 5 % of one) shows no change: 0.25 of a level at most.
const EASED = 1e-3;
const FLOOR = 0.05;

const changed = (now: readonly number[], then: readonly number[]): boolean =>
  now.length !== then.length ||
  now.some((value, at) => {
    const was = then[at] ?? Number.NaN;
    return Math.abs(value - was) > EASED * Math.max(Math.abs(value), Math.abs(was), FLOOR);
  });

export class Redraw {
  #drawn: Moment | undefined;
  #told = false;
  /** Set by the loop while it paces a view with something moving (rest.ts): a frame that would be "none" is drawn all the same. */
  live = false;

  /** Something outside the numbers changed (a place, a lens, a plate, the worlds): the next frame is drawn. */
  touch(): void {
    this.#told = true;
  }

  /** What the frame `now` needs; what is drawn becomes what the next is measured against. */
  check(now: Moment): Need {
    const then = this.#drawn;
    let need: Need =
      then === undefined || this.#told || now.moving || changed(now.shown, then.shown) ? "full" : slow(now, then);
    if (need === "none" && this.live) need = "ambient";
    if (need !== "none") {
      this.#drawn = { ...now, eye: [...now.eye], shown: [...now.shown] };
      this.#told = false;
    }
    return need;
  }
}

const at = (from: readonly number[], index: number): number => from[index] ?? 0;

// The angle between two orientations, in radians.
const turnOf = (a: readonly number[], b: readonly number[]): number =>
  2 *
  Math.acos(
    Math.min(1, Math.abs(at(a, 3) * at(b, 3) + at(a, 4) * at(b, 4) + at(a, 5) * at(b, 5) + at(a, 6) * at(b, 6))),
  );

const moveOf = (a: readonly number[], b: readonly number[]): number =>
  Math.hypot(at(a, 0) - at(b, 0), at(a, 1) - at(b, 1), at(a, 2) - at(b, 2));

// The camera's turn and move, in pixels, and the slow motions' since the last drawn frame, against half a pixel.
function slow(now: Moment, then: Moment): Need {
  const pixels =
    turnOf(now.eye, then.eye) / now.pxK +
    moveOf(now.eye, then.eye) / (now.distance * now.pxK) +
    (now.seconds - then.seconds) * now.pxPerSecond;
  return pixels > HALF_PIXEL ? "ambient" : "none";
}
