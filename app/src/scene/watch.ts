// What the scene listens to in the page; every listener goes with the signal.
import { SNAPSHOT_EVENT, SNAPSHOT_TAKEN } from "@gnoworld/core";
import type { Eye } from "./eye.ts";
import type { FrameLoop } from "./loop.ts";
import { OVER_SCENE } from "./overScene.ts";
import { watchQuality } from "./quality.ts";

const MOTION = "(prefers-reduced-motion: reduce)";

/** Reduced motion, as the reader asks it: the system's word, or this device's setting, which the page marks on the root (slice 8). */
export interface Motion {
  readonly matches: boolean;
  /** Calls `changed` when either changes, until `signal` aborts. */
  watch: (changed: () => void, signal: AbortSignal) => void;
}

export function motionOf(): Motion {
  const system = matchMedia(MOTION);
  // Read at each use: a scene's parts are made where no page is, in their tests.
  const root = (): HTMLElement | undefined => ("document" in globalThis ? document.documentElement : undefined);
  return {
    get matches() {
      return system.matches || root()?.dataset["motion"] === "reduce";
    },
    watch: (changed, signal) => {
      system.addEventListener("change", changed, { signal });
      const page = root();
      if (page === undefined) return;
      const marks = new MutationObserver(changed);
      marks.observe(page, { attributes: true, attributeFilter: ["data-motion"] });
      signal.addEventListener("abort", () => {
        marks.disconnect();
      });
    },
  };
}
const INPUTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"];

/** Feeds the loop from the tab, the window, the reader's motion setting and their inputs. */
function watchPage(loop: FrameLoop, signal: AbortSignal): void {
  const motion = motionOf();
  const read = () => {
    loop.set({ hidden: document.hidden, focused: document.hasFocus(), still: motion.matches });
  };
  read();
  document.addEventListener("visibilitychange", read, { signal });
  motion.watch(read, signal);
  // The document's word, not the event's: the focus going into an embed blurs the window that still has it.
  window.addEventListener("focus", read, { signal });
  window.addEventListener("blur", read, { signal });
  const input = () => {
    loop.input();
  };
  for (const name of INPUTS) window.addEventListener(name, input, { signal, passive: true });
}

/** Gives the eye a mouse's place to aim at, -1 to 1 across the window, y up. A finger is no aim. A mouse on what the scene places over
 * itself holds the lean where it is: a label is a door to its world (ADR-0003, 2e), which would slide from under the pointer (F4646). */
function watchAim(eye: Pick<Eye, "aim" | "hold">, signal: AbortSignal): void {
  window.addEventListener(
    "pointermove",
    ({ pointerType, clientX, clientY, target }) => {
      if (pointerType !== "mouse") return;
      if (target instanceof Element && target.closest(OVER_SCENE) !== null) eye.hold();
      else eye.aim((clientX / innerWidth) * 2 - 1, 1 - (clientY / innerHeight) * 2);
    },
    { signal, passive: true },
  );
}

/** Calls `apply` when the window moves to a screen of another pixel ratio, and on the one after. */
function watchScreen(apply: () => void, signal: AbortSignal): void {
  const arm = () => {
    matchMedia(`(resolution: ${String(devicePixelRatio)}dppx)`).addEventListener(
      "change",
      () => {
        apply();
        arm();
      },
      { once: true, signal },
    );
  };
  arm();
}

/** Calls `on.resized` when the canvas's box changes, and `on.lost` with true when its context goes, false when it comes back. */
function watchCanvas(
  canvas: HTMLCanvasElement,
  on: { readonly resized: () => void; readonly lost: (now: boolean) => void },
  signal: AbortSignal,
): void {
  const observer = new ResizeObserver(on.resized);
  observer.observe(canvas);
  signal.addEventListener("abort", () => {
    observer.disconnect();
  });
  canvas.addEventListener(
    "webglcontextlost",
    () => {
      on.lost(true);
    },
    { signal },
  );
  canvas.addEventListener(
    "webglcontextrestored",
    () => {
      on.lost(false);
    },
    { signal },
  );
}

/** Answers a share's ask for the view (core's SNAPSHOT_EVENT) on the canvas, with the next frame's picture. */
function watchShare(canvas: HTMLCanvasElement, loop: FrameLoop, signal: AbortSignal): void {
  canvas.addEventListener(
    SNAPSHOT_EVENT,
    () => {
      loop.picture(canvas).then((picture) => {
        canvas.dispatchEvent(new CustomEvent(SNAPSHOT_TAKEN, { detail: picture }));
      }, reportError);
    },
    { signal },
  );
}

/** Everything the scene listens to in the page, `canvas` and its context with it. */
export function watchScene(
  canvas: HTMLCanvasElement,
  scene: {
    readonly loop: FrameLoop;
    readonly eye: Pick<Eye, "aim" | "hold">;
    readonly changed: () => void;
    readonly resized: () => void;
    readonly lost: (now: boolean) => void;
  },
  signal: AbortSignal,
): void {
  watchPage(scene.loop, signal);
  watchScreen(scene.changed, signal);
  watchQuality(scene.changed, signal);
  watchAim(scene.eye, signal);
  watchCanvas(canvas, scene, signal);
  watchShare(canvas, scene.loop, signal);
}
