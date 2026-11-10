import { FULL_MOVE } from "../fullChat.ts";

// The reader's reduced-motion setting, apart from the scene's listeners: the home's rise reads it with no 3D engine loaded.
const MOTION = "(prefers-reduced-motion: reduce)";

/** Reduced motion, as the reader asks it: the system's word, or this device's setting, which the page marks on the root (slice 8). */
export interface Motion {
  readonly matches: boolean;
  /** Calls `changed` when either changes, until `signal` aborts. */
  watch: (changed: () => void, signal: AbortSignal) => void;
}

/** Whether the full chat covers space (features/chat/full.ts marks the root): the scene draws nothing it would hide. Its change is told
 * by Motion's `watch`, which reads the root's marks. */
export const coveredByChat = (): boolean =>
  "document" in globalThis && document.documentElement.dataset["chat"] === "full";

// How long the full chat grows over the scene before it covers it (fullChat.ts FULL_MOVE.duration, 0.9 s, and a little more).
const CHAT_GROWS_MS = FULL_MOVE.duration * 1000 + 200;
let coveredSince: number | undefined;

/** Whether the full chat hides the scene: once it has grown over it, never as its mark is set (the scene draws on and dims out, frame.ts). */
export function chatHides(): boolean {
  if (!coveredByChat()) {
    coveredSince = undefined;
    return false;
  }
  coveredSince ??= performance.now();
  return performance.now() - coveredSince > CHAT_GROWS_MS;
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
      marks.observe(page, { attributes: true, attributeFilter: ["data-motion", "data-chat"] });
      signal.addEventListener("abort", () => {
        marks.disconnect();
      });
    },
  };
}
