// The whole cosmos's place in the cosmos (ADR-0002 §10; Alexis, 2026-11-02): its chunk asked once the eye may be leaving for it, its share
// of the view from how far the eye is from what it looks at, the same at one distance for all that gives it up, and its look and its set
// handed on once it came.
import { MOOD_SCALE, wholeShare, type ClearBox, type Point } from "@gnoworld/core";
import type { Disposer } from "../disposer.ts";
import { Door } from "../door.ts";
import type { EarthDevice } from "../earth/device.ts";
import { Ahead } from "./ahead.ts";
import type { Web, WebSet } from "./web.ts";

// Past this distance from what it looks at, the eye may be leaving for it: its chunk is asked well before it shows.
const NEAR = MOOD_SCALE / 2;
// How far the eye moves before a look, near and as a share of the way to what it looks at: a point's size is out by a few percent at most.
const STEP = 4;
const STEP_SHARE = 0.01;

export class Whole {
  readonly #device: EarthDevice;
  readonly #door: Door<Web>;
  readonly #came: () => void;
  #set: WebSet | undefined;
  #share = 0;
  #distance = 0;
  #ratio = 1;
  #compiled = false;
  /** How far the eye may move before the cosmos looks again, from where this frame found it. */
  step = STEP;
  /** The most of the view it may take: the dive fades it in (7d7). */
  most = 1;

  /** `came` is told when its part came, which then needs a look. */
  /** `box`, the page's text's, which the mass keeps clear as the disc does. */
  constructor(
    device: EarthDevice,
    owner: Disposer,
    { came, box }: { came: () => void; box: () => ClearBox | undefined },
  ) {
    this.#device = device;
    this.#came = came;
    this.#door = new Door(
      () =>
        import("./web.ts").then(
          ({ Web: Loaded }) =>
            () =>
              new Loaded({ camera: device.camera, page: typeof document === "undefined" ? undefined : document, box }),
        ),
      owner,
      { came: this.#webCame },
    );
  }

  // Its part came: it stands the set, compiled before it shows.
  readonly #webCame = (web: Web): void => {
    this.#device.stage.add(web.group);
    web.resize(this.#ratio);
    if (this.#set !== undefined) web.stand(this.#set, Date.now());
    new Ahead(this.#device, web.group, () => {
      this.#compiled = true;
      this.#device.moved();
    }).ask();
    this.#came();
  };

  /** The set it draws: the cosmos's systems, the file's worlds and its time. The same set again stands nothing. */
  stand(set: WebSet): void {
    const before = this.#set;
    if (before?.systems === set.systems && before.worlds === set.worlds && before.written === set.written) return;
    this.#set = set;
    this.#door.part?.stand(set, Date.now());
  }

  /** Asks for its part now: the home's dive opens in it (7d7). */
  open(): void {
    this.#door.open();
  }

  /** Whether it can take the view: its part here, its program compiled, a world to draw. */
  get ready(): boolean {
    return this.#compiled && (this.#door.part?.count ?? 0) > 0;
  }

  resize(ratio: number): void {
    this.#ratio = ratio;
    this.#door.part?.resize(ratio);
  }

  /** A frame from `eye`, on the stage, `distance` from what it looks at: how much of the view is the whole cosmos's, which the rest gives
   * up. None while it cannot take it: its chunk on its way or failed, its program not compiled, no world to draw; its first frame asks a
   * look. */
  advance(eye: Point, seconds: number, distance: number): number {
    this.#distance = distance;
    this.step = Math.max(STEP, STEP_SHARE * distance);
    if (distance > NEAR) this.#door.open();
    const share = this.ready ? wholeShare(distance) : 0;
    if (share > 0 && this.#share === 0) this.#came();
    this.#share = share;
    this.#door.part?.advance(eye, seconds, share * this.most);
    return share;
  }

  /** A look from the eye on the map, through a lens of `focal` pixels, in focus where the last frame's eye looked. */
  look(mapEye: Point, focal: number): void {
    if (this.#share > 0) this.#door.part?.look({ eye: mapEye, focal, focus: this.#distance }, Date.now());
  }

  /** The cosmos is hidden: so is it. */
  hide(): void {
    const web = this.#door.part;
    if (web !== undefined) web.group.visible = false;
  }

  stats() {
    return this.#door.part?.stats();
  }
}
