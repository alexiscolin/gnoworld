// The scene's one loop (ADR-0002 §9, rendering). A frame is asked only when one is due, a timer waiting out the slower rates, so at
// 30 and 10 fps the page wakes at that rate and not at the screen's; at 0 nothing waits at all. Nothing here allocates on a frame.
import { carryOver, frameRate, frameWait, isDue, type FrameRate, type LoopState } from "@gnoworld/core";
import { copyOf } from "./snapshot.ts";

export interface FrameClock {
  now(): number;
  ask(run: (time: number) => void): number;
  cancelAsk(id: number): void;
  wait(run: () => void, ms: number): number;
  cancelWait(id: number): void;
}

/** The browser's. */
export const browserClock: FrameClock = {
  now: () => performance.now(),
  ask: (run) => requestAnimationFrame(run),
  cancelAsk: (id) => {
    cancelAnimationFrame(id);
  },
  wait: (run, ms) => window.setTimeout(run, ms),
  cancelWait: (id) => {
    clearTimeout(id);
  },
};

type Flags = Pick<LoopState, "hidden" | "covered" | "focused" | "busy" | "still">;
const NONE = -1;
// Below this a timer saves nothing: the next refresh is about as near.
const WORTH_A_TIMER_MS = 17;

export class FrameLoop {
  readonly #clock: FrameClock;
  readonly #draw: (delta: number) => void;
  readonly #state: { -readonly [K in keyof LoopState]: LoopState[K] } = {
    hidden: false,
    covered: false,
    focused: true,
    busy: false,
    owed: true,
    still: false,
    sinceInput: 0,
  };
  #lastInput: number;
  #lastRefresh = NONE;
  #lastDraw = NONE;
  #carried = 0;
  #rate: FrameRate = 0;
  #frame = NONE;
  #timer = NONE;
  #stopped = false;
  // The pictures asked of the next frame (a share's, slice 8): none but while one waits.
  #pictures: { canvas: HTMLCanvasElement; done: (picture: HTMLCanvasElement | undefined) => void }[] = [];

  constructor(clock: FrameClock, draw: (delta: number) => void) {
    this.#clock = clock;
    this.#draw = draw;
    this.#lastInput = clock.now();
    this.#reschedule();
  }

  /** Changes what the rate depends on. */
  set(change: Partial<Flags>): void {
    Object.assign(this.#state, change);
    this.#reschedule();
  }

  /** The reader did something: the idle minute starts again. */
  input(): void {
    this.#lastInput = this.#clock.now();
    if (this.#readRate() !== this.#rate) this.#reschedule();
  }

  /** Owes one frame, whatever the rate. */
  redraw(): void {
    this.#state.owed = true;
    this.#reschedule();
  }

  /** A copy of `canvas` as the next frame draws it, made in that frame, as WebGL keeps no buffer past it. */
  picture(canvas: HTMLCanvasElement): Promise<HTMLCanvasElement | undefined> {
    return new Promise((done) => {
      this.#pictures.push({ canvas, done });
      this.redraw();
    });
  }

  /** Stops for good. */
  stop(): void {
    this.#stopped = true;
    this.#cancel();
  }

  #readRate(): FrameRate {
    this.#state.sinceInput = this.#clock.now() - this.#lastInput;
    return frameRate(this.#state);
  }

  #cancel(): void {
    if (this.#frame !== NONE) this.#clock.cancelAsk(this.#frame);
    if (this.#timer !== NONE) this.#clock.cancelWait(this.#timer);
    this.#frame = NONE;
    this.#timer = NONE;
  }

  #reschedule(): void {
    this.#cancel();
    if (this.#stopped) return;
    this.#rate = this.#readRate();
    if (this.#rate === 0) {
      this.#lastRefresh = NONE;
      this.#lastDraw = NONE;
      this.#carried = 0;
      return;
    }
    // From the last refresh, not from now: the draw has spent some of the wait, and a change must not start it again.
    const spent = this.#clock.now() - this.#lastRefresh;
    const wait = this.#lastRefresh === NONE ? 0 : frameWait(this.#carried, this.#rate) - spent;
    if (wait > WORTH_A_TIMER_MS) this.#timer = this.#clock.wait(this.#wake, wait);
    else this.#frame = this.#clock.ask(this.#tick);
  }

  #shoot(): void {
    const asked = this.#pictures;
    this.#pictures = [];
    for (const { canvas, done } of asked) done(copyOf(canvas));
  }

  readonly #wake = (): void => {
    this.#timer = NONE;
    this.#frame = this.#clock.ask(this.#tick);
  };

  readonly #tick = (time: number): void => {
    this.#frame = NONE;
    const rate = this.#readRate();
    const elapsed = this.#lastRefresh === NONE ? 1000 / rate : time - this.#lastRefresh;
    this.#lastRefresh = time;
    if (isDue(this.#carried, elapsed, rate)) {
      this.#carried = carryOver(this.#carried, elapsed, rate);
      const delta = this.#lastDraw === NONE ? 0 : time - this.#lastDraw;
      this.#lastDraw = time;
      this.#state.owed = false;
      this.#draw(delta);
      if (this.#pictures.length > 0) this.#shoot();
    } else this.#carried += elapsed;
    this.#reschedule();
  };
}
