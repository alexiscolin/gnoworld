import { whenArrived } from "../arrived.ts";
import { motionAsked, watchMotion } from "../motion.ts";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// The arrival's figures count up, easing out as GSAP's power4.out would, after the page's text starts entering: once the flight that brings
// it nears its end (`data-flown`, set by the app's globe box). A stat counts 0.9 s after 0.25 s; the plate's band, the proposal's 1.1 s after 0.7 s.
const FLYING = "[data-flown='flying']";

// The flight's mark, read as the count starts and again only once the page changed under it: a mark set or cleared, a box come or gone.
function flightOf(): { flying: () => boolean; stop: () => void } {
  const read = () => document.querySelector(FLYING) !== null;
  let flying = read();
  const watch = new MutationObserver(() => {
    flying = read();
  });
  watch.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-flown"],
  });
  return {
    // The changes not yet told are taken at once: a frame never reads a mark a microtask late.
    flying: () => {
      if (watch.takeRecords().length > 0) flying = read();
      return flying;
    },
    stop: () => {
      watch.disconnect();
    },
  };
}

/** How long a figure takes to move from the value drawn to a new one, after the arrival: the same curve, shorter. */
const MOVE = 450;

/** The figure as drawn: from nothing to its value on arrival, easing out, when motion is welcome; never
 * on the server, so the page it sends holds the value. A value that changes after counts from the one drawn to the new, a shorter count on the
 * same curve; under reduced motion it stands at its value at once. */
export function useCounted(value: number, { count = 900, after = 250 } = {}) {
  const moving = useSyncExternalStore(watchMotion, motionAsked, () => false);
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
    let flight: ReturnType<typeof flightOf> | undefined;
    function begin() {
      start = performance.now();
      if (arriving) flight = flightOf();
      frame = requestAnimationFrame(step);
    }
    const step = (now: number) => {
      // The arrival waits out a flight: it starts as the page lands.
      if (flight?.flying() === true) start = now;
      const far = Math.min(1, Math.max(0, (now - start - wait) / long));
      const next = far < 1 ? Math.round(from + (value - from) * (1 - (1 - far) ** 4)) : value;
      lastRef.current.drawn = next;
      setDrawn(next);
      if (far < 1) {
        frame = requestAnimationFrame(step);
        return;
      }
      lastRef.current.arrived = true;
      flight?.stop();
    };
    // The box's wait for the scene (arrived.ts, the page's one clock) holds the first frame.
    let unwait = (): void => undefined;
    if (arriving) unwait = whenArrived(begin);
    else begin();
    return () => {
      unwait();
      flight?.stop();
      cancelAnimationFrame(frame);
    };
  }, [moving, value, count, after]);
  return moving ? drawn : value;
}
