// The loop's control (D401, P400, P102): when a frame is worked on, when the loop sleeps and what wakes it. What a frame does is the beat's
// (frame.ts); this holds the rules: the pace, the cap on a frame's step, the nap after a still view, the sleep while unseen, the buffer
// freed after it, and every listener and timer, which go when `signal` aborts.
import { gapFor } from "./pace.ts";
import { LIVELY_MS } from "./rest.ts";
import type { Need } from "./redraw.ts";
import { pulse } from "./pulse.ts";
import { wakeOn } from "./wakes.ts";

const LONGEST_STEP_MS = 50;
// A sleeping loop frees what only it holds after this long, as nothing shows: the next frame makes it again.
const FREE_MS = 10_000;

/** What a frame is made of, given by the engine. */
export interface Beat {
  /** The engine is gone for good. */
  gone(): boolean;
  /** Nothing shows: the page is hidden or covers space, or the context is lost. */
  unseen(): boolean;
  focused(): boolean;
  /** Each frame the screen gave, worked on or not. */
  watch(now: number): void;
  /** One frame: `delta` ms of motion (capped), `slept` seconds more for the clock alone after a nap, `real` ms since the last frame for what counts rest. The need it left. */
  work(step: { now: number; delta: number; slept: number; real: number }): Need;
  /** How long the loop may sleep after a frame that left `need`, `calm` ms after the last change; none, it stays awake. */
  nap(need: Need, calm: number): number | undefined;
  /** Whether the loop is pacing a view with something moving (D13013): an input then brings the full pace back. */
  lively(): boolean;
  /** Lets go of what only a running scene holds (the drawing buffer, the blur's target). */
  free(): void;
  /** The canvas's box changed. */
  resized(): void;
}

/** What the loop is woken by, from the page. */
export interface Sources {
  /** The engine's end. */
  readonly signal: AbortSignal;
  /** Asks the next frame; the browser's by default. */
  readonly frames?: (callback: (now: number) => void) => unknown;
  readonly page: EventTarget;
  readonly window: EventTarget;
  readonly canvas: EventTarget;
  /** Calls `changed` when the page's marks (the chat, motion, quality) change, until the signal aborts. */
  readonly marks: (changed: () => void, signal: AbortSignal) => void;
  /** Calls `run` when the canvas's box changes, until the signal aborts. */
  readonly box: (run: () => void, signal: AbortSignal) => void;
}

/** The engine's side of the wake: `wake` asks a frame where the loop sleeps (a no-op awake, never touching back), `touch` also draws. */
export interface Keep {
  wake: () => void;
  touch: () => void;
}

/** Runs the loop of `beat` till `signal` aborts; sets `keep.wake`. */
export function loop(beat: Beat, keep: Keep, on: Sources): void {
  const { signal, frames = requestAnimationFrame } = on;
  let [last, changed, dozed, need] = [performance.now(), 0, false, "full" as Need];
  let [sleeper, napper]: [ReturnType<typeof setTimeout> | undefined, ReturnType<typeof setTimeout> | undefined] = [
    undefined,
    undefined,
  ];
  const frame = (now: number): Need => {
    // A frame's stamp may come before the clock read as the loop began: never a step back, which would start a flight's slide below 0.
    const gap = Math.max(now - last, 0);
    // The step is capped even after a nap: an ease, the arrival or a flight never jumps; only the clock the orbits ride goes on.
    const delta = Math.min(gap, LONGEST_STEP_MS);
    const slept = dozed ? (gap - delta) / 1000 : 0;
    [dozed, last] = [false, now];
    const need = beat.work({ now, delta, slept, real: gap });
    // Only a change that is not a slow orbit's half pixel keeps the loop awake: that one comes every few seconds, for ever.
    if (need === "full") changed = now;
    return need;
  };
  const run = (now: number): boolean => {
    if (beat.gone()) return false;
    if (beat.unseen()) {
      last = now;
      sleeper ??= setTimeout(() => {
        beat.free();
      }, FREE_MS);
      return false;
    }
    clearTimeout(sleeper);
    sleeper = undefined;
    beat.watch(now);
    const gap = gapFor(need, beat.focused());
    // A view with something moving by itself is drawn at 15 fps, whether it naps between frames or not (D13013).
    if (now - last < (need === "ambient" && beat.lively() ? Math.max(gap, LIVELY_MS) : gap) - 3) return true;
    need = frame(now);
    const nap = beat.nap(need, now - changed);
    if (nap === undefined) return true;
    dozed = true;
    napper = setTimeout(wake, nap);
    return false;
  };
  const wake = (keep.wake = pulse(
    (now) => {
      clearTimeout(napper);
      return run(now);
    },
    signal,
    frames,
  ));
  const input = () => {
    // A lively nap is no sleep: an input draws, and the changed time it sets keeps the full pace till the view is still again.
    if (beat.lively()) keep.touch();
    else keep.wake();
  };
  const change = () => {
    keep.touch();
  };
  wakeOn(on, { input, change }, signal);
  on.canvas.addEventListener("webglcontextrestored", change, { signal });
  on.marks(change, signal);
  on.box(() => {
    beat.resized();
    keep.wake();
  }, signal);
  signal.addEventListener("abort", () => {
    keep.wake = () => undefined;
    clearTimeout(sleeper);
    clearTimeout(napper);
  });
}
