// The place band folds to a slim row while the lines are scrolled up, and unfolds as they come back to their end. Two thresholds, not
// one: folding gives the lines the band's height, which moves their end nearer, so a single threshold would flick back and forth.
import { useEffect, useState, type RefObject } from "react";

// raw: px from the end of the lines, past which the band folds, and under which it unfolds; the gap is wider than the band's own fold (44 px)
export const FAR = 240;
export const NEAR = 48;

/** How far a scrolled list is from its end. */
export const awayFromEnd = ({
  scrollHeight,
  scrollTop,
  clientHeight,
}: Pick<Element, "scrollHeight" | "scrollTop" | "clientHeight">) => scrollHeight - scrollTop - clientHeight;

/** Whether the band is folded next, given whether it is and how far the lines are from their end. */
export const nextFold = (folded: boolean, away: number): boolean => (folded ? away > NEAR : away > FAR);

/** Calls `set` with the new fold's rule at each scroll of the conversation's Messages list, until `signal` aborts. */
export function followLines(
  screen: HTMLElement,
  set: (fold: (folded: boolean) => boolean) => void,
  signal: AbortSignal,
) {
  screen.addEventListener(
    "scroll",
    ({ target }) => {
      if (!(target instanceof HTMLElement) || !target.matches('ol[aria-label="Messages"]')) return;
      // The control in use stays where it is: no fold under a finger on the band's own chips and buttons.
      if (screen.querySelector("[data-phone-band]")?.contains(document.activeElement)) return;
      set((folded) => nextFold(folded, awayFromEnd(target)));
    },
    { capture: true, signal },
  );
}

/** Whether the lines in `screen` are scrolled up far enough to fold the band. */
export function useLinesFold(screen: RefObject<HTMLElement | null>): boolean {
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    const box = screen.current;
    if (box === null) return;
    const stop = new AbortController();
    followLines(box, setFolded, stop.signal);
    return () => {
      stop.abort();
    };
  }, [screen]);
  return folded;
}
