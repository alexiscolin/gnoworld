// The whole cosmos's place in the cosmos (ADR-0002 §10; Alexis, 2026-11-02): its chunk asked once the eye may be leaving for it, its share
// of the view from how far the eye is from what it looks at, the same at one distance for all that gives it up, and its look and its set
// handed on once it came.
import { focusDistance, MOOD_SCALE, wholeShare, type Point } from "@gnoworld/core";
import type { Disposer } from "../disposer.ts";
import { Door } from "../door.ts";
import type { EarthDevice } from "../earth/device.ts";
import { Ahead } from "./ahead.ts";
import type { Web, WebSet } from "./web.ts";

// Past this distance from what it looks at, the eye may be leaving for it: its chunk is asked well before it shows.
const NEAR = MOOD_SCALE / 2;

export class Whole {
  readonly #device: EarthDevice;
  readonly #door: Door<Web>;
  readonly #came: () => void;
  #set: WebSet | undefined;
  #share = 0;
  #ratio = 1;

  /** `came` is told when its part came, which then needs a look. */
  constructor(device: EarthDevice, owner: Disposer, came: () => void) {
    this.#device = device;
    this.#came = came;
    this.#door = new Door(
      () =>
        import("./web.ts").then(
          ({ Web: Loaded }) =>
            () =>
              new Loaded(),
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
    new Ahead(this.#device, web.group, this.#device.moved).ask();
    this.#came();
  };

  /** The set it draws: the cosmos's systems, the file's worlds and its time. The same set again stands nothing. */
  stand(set: WebSet): void {
    const before = this.#set;
    if (before?.systems === set.systems && before.worlds === set.worlds && before.written === set.written) return;
    this.#set = set;
    this.#door.part?.stand(set, Date.now());
  }

  resize(ratio: number): void {
    this.#ratio = ratio;
    this.#door.part?.resize(ratio);
  }

  /** A frame from `eye`, on the stage: how much of the view is the whole cosmos's, which the rest gives up. */
  advance(eye: Point, seconds: number): number {
    const distance = focusDistance(eye);
    if (distance > NEAR) this.#door.open();
    this.#share = wholeShare(distance);
    this.#door.part?.advance(eye, seconds, this.#share);
    return this.#share;
  }

  /** A look from the eye on the map, through a lens of `focal` pixels, from `eye` on the stage. */
  look(mapEye: Point, focal: number, eye: Point): void {
    if (this.#share > 0) this.#door.part?.look({ eye: mapEye, focal, focus: focusDistance(eye) }, Date.now());
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
