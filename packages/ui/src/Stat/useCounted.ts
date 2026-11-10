import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// The arrival's figures count up, easing out as GSAP's power4.out would, after the page's text starts entering: once the flight that brings
// it nears its end (`data-flown`, set by the app's globe box). A stat counts 0.9 s after 0.25 s; the plate's band, the proposal's 1.1 s after 0.7 s.
const FLYING = "[data-flown='flying']";

// No-preference at the system's word and at this device's setting (slice 8: the root's data-motion).
const MOTION = "(prefers-reduced-motion: no-preference)";
const unwatched = () => () => undefined;

/** How long a figure takes to move from the value drawn to a new one, after the arrival: the same curve, shorter. */
const MOVE = 450;

/** The figure as drawn: from nothing to its value on arrival, easing out, when motion is welcome; never
 * on the server, so the page it sends holds the value. A value that changes after counts from the one drawn to the new, a shorter count on the
 * same curve; under reduced motion it stands at its value at once. */
export function useCounted(value: number, { count = 900, after = 250 } = {}) {
  const moving = useSyncExternalStore(
    unwatched,
    () => matchMedia(MOTION).matches && document.documentElement.dataset["motion"] !== "reduce",
    () => false,
  );
  // The figure as last drawn, and whether the arrival's count has ended.
  const [drawn, setDrawn] = useState(0);
  const lastRef = useRef({ drawn: 0, arrived: false });
  useEffect(() => {
    if (!moving) return;
    const from = lastRef.current.drawn;
    const arriving = !lastRef.current.arrived;
    const [long, wait] = arriving ? [count, after] : [MOVE, 0];
    // A frame's time can come just before the effect's: the count starts at the first value, never before.
    let start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      // The arrival waits out a flight, and the box's wait for the scene: it starts as the page lands.
      if (
        arriving &&
        (document.querySelector(FLYING) !== null || document.documentElement.dataset["arrive"] === "wait")
      )
        start = now;
      const far = Math.min(1, Math.max(0, (now - start - wait) / long));
      const next = far < 1 ? Math.round(from + (value - from) * (1 - (1 - far) ** 4)) : value;
      lastRef.current.drawn = next;
      setDrawn(next);
      if (far >= 1) lastRef.current.arrived = true;
      if (far < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [moving, value, count, after]);
  return moving ? drawn : value;
}
