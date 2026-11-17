// The gate of a phone's 3D planet (the place band's): the band shows its still at the first paint, and the engine (MiniSpace's chunk, its
// GPU probe, the scene and earth chunks) is asked only once the first screen is idle and the band in view, never for a reader who saves data
// or whose link the browser estimates at 2g (D13721, the phone's side), never on a weak GPU, and never twice.
import { gpuCanDraw } from "./features/universe/gpu.ts";
import { savesData } from "./lib/saveData.ts";

// The longest the first screen may keep the engine waiting where the browser never finds it idle.
const IDLE_MS = 3000;

/** A loader that answers the engine's import once, or nothing where the reader saves data or the GPU cannot draw (the probe is not made then). */
export function planetLoader<T>({
  saves,
  draws,
  load,
}: {
  saves: () => boolean;
  draws: () => boolean;
  load: () => Promise<T>;
}): () => Promise<T> | undefined {
  let loading: Promise<T> | undefined;
  return () => {
    if (loading !== undefined) return loading;
    if (saves() || !draws()) return undefined;
    loading = load();
    return loading;
  };
}

/** The phone's one loader: the module's, so a band drawn again does not ask again. */
export const askPlanet = planetLoader({ saves: savesData, draws: gpuCanDraw, load: () => import("./MiniSpace.tsx") });

/** Settles once the page is idle (a browser without `requestIdleCallback` waits a fixed while) and `band` is in view; never once `signal` aborts. */
export function whenIdleAndSeen(band: Element, signal: AbortSignal): Promise<void> {
  const idle = new Promise<void>((resolve) => {
    const done = () => {
      if (!signal.aborted) resolve();
    };
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(done, { timeout: IDLE_MS });
      signal.addEventListener("abort", () => {
        cancelIdleCallback(id);
      });
    } else {
      const id = setTimeout(done, IDLE_MS / 2);
      signal.addEventListener("abort", () => {
        clearTimeout(id);
      });
    }
  });
  const seen = new Promise<void>((resolve) => {
    const watch = new IntersectionObserver((entries) => {
      if (signal.aborted || !entries.some((each) => each.isIntersecting)) return;
      watch.disconnect();
      resolve();
    });
    watch.observe(band);
    signal.addEventListener("abort", () => {
      watch.disconnect();
    });
  });
  return Promise.all([idle, seen]).then(() => undefined);
}
