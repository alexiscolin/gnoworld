// What the scene listens to in the page; every listener goes with the signal.
import type { FrameLoop } from "./loop.ts";

const MOTION = "(prefers-reduced-motion: reduce)";
const INPUTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"];

/** Feeds the loop from the tab, the window, the reader's motion setting and their inputs. */
export function watchPage(loop: FrameLoop, signal: AbortSignal): void {
  const motion = matchMedia(MOTION);
  const read = () => {
    loop.set({ hidden: document.hidden, focused: document.hasFocus(), still: motion.matches });
  };
  read();
  document.addEventListener("visibilitychange", read, { signal });
  motion.addEventListener("change", read, { signal });
  window.addEventListener(
    "focus",
    () => {
      loop.set({ focused: true });
    },
    { signal },
  );
  window.addEventListener(
    "blur",
    () => {
      loop.set({ focused: false });
    },
    { signal },
  );
  const input = () => {
    loop.input();
  };
  for (const name of INPUTS) window.addEventListener(name, input, { signal, passive: true });
}

/** Calls `apply` when the window moves to a screen of another pixel ratio, and on the one after. */
export function watchScreen(apply: () => void, signal: AbortSignal): void {
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
