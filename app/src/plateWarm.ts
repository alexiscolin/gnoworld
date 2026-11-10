// What a plate is given ahead of the click (slice 13; Alexis, 2026-11-10: "des stratégies de preload pendant l'animation, dès qu'on survole le
// lien de la planète, et mise en cache"). Two small doors here, which the first screen holds; what they bring is in warm.ts, a chunk of its own,
// asked only when one of them fires:
//  - the view's: once the page's space has drawn its first frame, and the browser is idle, the plate's code and the rollup files of the worlds in view;
//  - the reader's intent: a pointer resting on a link to a realm (150 ms), its focus, a press or a touch, whatever the device: the realm's reads.
// Never at first paint (the scene's chunk delayed the loader by seconds when preloaded then, preloads.ts), never under Save-Data.
import { savesData } from "./lib/saveData.ts";

const warm = () => import("./warm.ts");
const report = (error: unknown) => {
  reportError(error);
};

/** Runs `cb` in the browser's idle time once the page has loaded (a timer in Safari, which has no idle callback); what it returns cancels. */
function whenIdle(cb: () => void): () => void {
  let cancel = () => {
    removeEventListener("load", ready);
  };
  function ready() {
    if ("requestIdleCallback" in globalThis) {
      const handle = requestIdleCallback(cb, { timeout: 3_000 });
      cancel = () => {
        cancelIdleCallback(handle);
      };
    } else {
      const handle = setTimeout(cb, 1_500);
      cancel = () => {
        clearTimeout(handle);
      };
    }
  }
  if (document.readyState === "complete") ready();
  else addEventListener("load", ready, { once: true });
  return () => {
    cancel();
  };
}

// The links' intent, listened to once for the page's life: one at a time, the last, and none for a pointer that left before its delay.
const HOVER_MS = 150;
let listening = false;
let pending: ReturnType<typeof setTimeout> | undefined;

function realmLink(target: EventTarget | null): HTMLAnchorElement | undefined {
  const link = target instanceof Element ? target.closest("a[href]") : null;
  return link instanceof HTMLAnchorElement && link.origin === location.origin && link.pathname.includes("/r/")
    ? link
    : undefined;
}

function listen(): void {
  if (listening) return;
  listening = true;
  const intent = (link: HTMLAnchorElement | undefined, after: number, pressed: boolean) => {
    clearTimeout(pending);
    if (link === undefined) return;
    pending = setTimeout(() => {
      // A pointer that left within the delay asks nothing.
      if (pressed || link.matches(":hover, :focus-visible"))
        warm().then((chunk) => {
          chunk.warmRealm(link.pathname, pressed);
        }, report);
    }, after);
  };
  const { documentElement: root } = document;
  root.addEventListener("pointerover", (event) => {
    if (event.pointerType !== "touch") {
      intent(realmLink(event.target), HOVER_MS, false);
    }
  });
  root.addEventListener("pointerout", () => {
    clearTimeout(pending);
  });
  root.addEventListener("focusin", (event) => {
    intent(realmLink(event.target), HOVER_MS, false);
  });
  // A press or a touch is the click's own start: the reads begin now, not at the click.
  for (const type of ["pointerdown", "touchstart"] as const)
    root.addEventListener(
      type,
      (event) => {
        intent(realmLink(event.target), 0, true);
      },
      { passive: true },
    );
}

/** Warms what a plate of `place` will want, once the page's space has drawn: the idle batch, which the view's change or a hidden tab stops, and
 * the links' intent. What it returns stops the batch (the view left). */
export function warmView(place: { kind: string; id: string }): () => void {
  if (import.meta.env.MODE === "test" || savesData()) return () => undefined;
  listen();
  const leaving = new AbortController();
  const stop = whenIdle(() => {
    warm().then((chunk) => chunk.warmBatch(place, leaving.signal), report);
  });
  return () => {
    stop();
    leaving.abort();
  };
}
