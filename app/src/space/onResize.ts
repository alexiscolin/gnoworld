/** Calls `run` when `element`'s box changes, until `signal` aborts. */
export function onResize(element: Element, run: () => void, signal: AbortSignal): void {
  const observer = new ResizeObserver(run);
  observer.observe(element);
  signal.addEventListener("abort", () => {
    observer.disconnect();
  });
}
