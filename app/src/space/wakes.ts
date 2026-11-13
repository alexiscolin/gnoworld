// What wakes a sleeping loop besides a call (P400): the reader's pointer, wheel, keys and touch and the window's size ask for a frame only,
// which the draw rule judges; the page showing again asks for a draw. All listeners go with `signal`.
const INPUTS = ["pointermove", "pointerdown", "wheel", "keydown", "touchstart"] as const;

/** Calls `wakes.input` on each input and the window's resize, `wakes.change` as the page shows again, until `signal` aborts. */
export function wakeOn(
  on: { page: EventTarget; window: EventTarget },
  wakes: { input: () => void; change: () => void },
  signal: AbortSignal,
): void {
  const { page, window } = on;
  for (const input of INPUTS) page.addEventListener(input, wakes.input, { signal, passive: true });
  page.addEventListener("visibilitychange", wakes.change, { signal });
  window.addEventListener("resize", wakes.input, { signal });
}
