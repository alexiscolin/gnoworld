// What the scene listens to in the page; every listener goes with the signal.
import type { FrameLoop } from "./loop.ts";

export const MOTION = "(prefers-reduced-motion: reduce)";
const INPUTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"];

/** Feeds the loop from the tab, the window, the reader's motion setting and their inputs. */
function watchPage(loop: FrameLoop, signal: AbortSignal): void {
  const motion = matchMedia(MOTION);
  const read = () => {
    loop.set({ hidden: document.hidden, focused: document.hasFocus(), still: motion.matches });
  };
  read();
  document.addEventListener("visibilitychange", read, { signal });
  motion.addEventListener("change", read, { signal });
  // The document's word, not the event's: the focus going into an embed blurs the window that still has it.
  window.addEventListener("focus", read, { signal });
  window.addEventListener("blur", read, { signal });
  const input = () => {
    loop.input();
  };
  for (const name of INPUTS) window.addEventListener(name, input, { signal, passive: true });
}

/** Gives `aim` a mouse's place, -1 to 1 across the window, y up. A finger is no aim. */
function watchAim(aim: (x: number, y: number) => void, signal: AbortSignal): void {
  window.addEventListener(
    "pointermove",
    ({ pointerType, clientX, clientY }) => {
      if (pointerType === "mouse") aim((clientX / innerWidth) * 2 - 1, 1 - (clientY / innerHeight) * 2);
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

/** Everything the scene listens to in the page, `canvas` and its context with it. */
export function watchScene(
  canvas: HTMLCanvasElement,
  scene: {
    readonly loop: FrameLoop;
    readonly aim: (x: number, y: number) => void;
    readonly changed: () => void;
    readonly resized: () => void;
    readonly lost: (now: boolean) => void;
  },
  signal: AbortSignal,
): void {
  watchPage(scene.loop, signal);
  watchScreen(scene.changed, signal);
  watchAim(scene.aim, signal);
  watchCanvas(canvas, scene, signal);
}
