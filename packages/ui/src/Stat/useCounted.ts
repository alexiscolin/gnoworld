import { useEffect, useState, useSyncExternalStore } from "react";

// The arrival's figures count up, easing out as GSAP's power4.out would, after the page's text starts entering: once the flight that brings
// it nears its end (`data-flown`, set by the app's globe box). A stat counts 0.9 s after 0.25 s; the plate's band, the proposal's 1.1 s after 0.7 s.
const FLYING = "[data-flown='flying']";

const MOTION = "(prefers-reduced-motion: no-preference)";
const unwatched = () => () => undefined;

/** The figure as drawn: from nothing to its value on arrival, easing out, when motion is welcome; never
 * on the server, so the page it sends holds the value. A value that changes after shows at once. */
export function useCounted(value: number, { count = 900, after = 250 } = {}) {
  const moving = useSyncExternalStore(
    unwatched,
    () => matchMedia(MOTION).matches,
    () => false,
  );
  // How far the count has come, from nothing to its value: 0 to 1.
  const [done, setDone] = useState(0);
  useEffect(() => {
    if (!moving) return;
    // A frame's time can come just before the effect's: the count starts at nothing, never below.
    let start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      // The count waits out a flight: it starts as the page lands.
      if (document.querySelector(FLYING) !== null) start = now;
      const far = Math.min(1, Math.max(0, (now - start - after) / count));
      setDone(far);
      if (far < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [moving, count, after]);
  return moving && done < 1 ? Math.round(value * (1 - (1 - done) ** 4)) : value;
}
