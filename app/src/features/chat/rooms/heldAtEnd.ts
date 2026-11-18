// A room's list opens at its end and stays there with no script: its scroll origin is its foot (RoomView.module.css, `.fill`:
// column-reverse), so what grows above never moves the end. What is left here is a reader's own place: a reader scrolled up keeps
// their lines still as something below them grows (the browser's scroll anchoring is off there: WebKit has none).
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

// How near the end, in pixels, the reader still reads the newest line.
const AT_END = 32;

// Whether a list is scrolled to its end, or within AT_END of it. `scrollTop` counts from the foot: 0 there, below 0 above it.
const atEnd = (box: HTMLElement) => box.scrollTop > -AT_END;

// A card that will still grow: its code has not come (empty), or its data has not (its body says busy, the prices say loading).
const UNFILLED = '[data-shared-card]:empty, [data-shared-card] :is([aria-busy="true"], [data-markets="loading"])';
// How long, at most, a room that opens with cards among its lines waits for them, in ms: its cards fill 60 to 300 ms after its lines.
const CARDS_WAIT_MS = 400;

// A room that opens with such a card among its lines shows once, whole: faded out (the list's `data-awaiting`, and its skeleton
// beside it) until no card is unfilled, CARDS_WAIT_MS at most, then faded in. The list stays at its foot meanwhile.
function useCardsAwaited(listRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const box = listRef.current;
    const unfilled = box?.querySelector(UNFILLED);
    if (box === null || unfilled === null || unfilled === undefined) return;
    const show = () => {
      box.removeAttribute("data-awaiting");
    };
    box.setAttribute("data-awaiting", "");
    const watch = new MutationObserver(() => {
      if (box.querySelector(UNFILLED) === null) show();
    });
    watch.observe(box, { subtree: true, childList: true, attributes: true });
    const latest = setTimeout(show, CARDS_WAIT_MS);
    return () => {
      watch.disconnect();
      clearTimeout(latest);
      show();
    };
  }, [listRef]);
}

// How far a line's foot is above the list's foot.
const awayOf = (box: HTMLElement, line: Element) =>
  box.getBoundingClientRect().bottom - line.getBoundingClientRect().bottom;

interface Anchor {
  current: { line: Element; away: number } | undefined;
}

// The first line the reader sees, noted with its distance from the foot.
function note(box: HTMLElement, anchor: Anchor) {
  const top = box.getBoundingClientRect().top;
  for (const line of box.firstElementChild?.children ?? []) {
    if (line.getBoundingClientRect().bottom <= top) continue;
    anchor.current = { line, away: awayOf(box, line) };
    return;
  }
}

/** The list of a room: it opens on its New line when there is one (`fresh`), else at its end (CSS). A reader scrolled up keeps
 * their place as a line, a card or an image grows under them: the first line they see is kept as far from the foot as it was
 * (the box's first child is the list, whose height tells every change). */
export function useNewestInView({ fresh }: { fresh: string | undefined }) {
  const listRef = useRef<HTMLDivElement>(null);
  const placedRef = useRef(false);
  const anchorRef: Anchor = useRef(undefined);
  useCardsAwaited(listRef);
  // The browser's own anchoring would move the reader's place a second time (a property CSS lints as not baseline).
  useLayoutEffect(() => {
    listRef.current?.style.setProperty("overflow-anchor", "none");
  }, []);
  useLayoutEffect(() => {
    const box = listRef.current;
    const item = fresh === undefined || placedRef.current ? null : box?.querySelector("ol > li[data-new]");
    if (box === null || item === null || item === undefined) return;
    placedRef.current = true;
    box.scrollTop += item.getBoundingClientRect().top - box.getBoundingClientRect().top;
    note(box, anchorRef);
  }, [fresh]);
  useEffect(() => {
    const box = listRef.current;
    const list = box?.firstElementChild;
    if (box === null || list === null || list === undefined || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(() => {
      const anchor = anchorRef.current;
      // At the end the foot holds the reader; above it, what grew under the lines they read moved them up by as much.
      if (anchor?.line.isConnected === true && !atEnd(box)) {
        const moved = awayOf(box, anchor.line) - anchor.away;
        if (Math.abs(moved) >= 1) box.scrollTop -= moved;
      }
      note(box, anchorRef);
    });
    watch.observe(list);
    return () => {
      watch.disconnect();
    };
  }, []);
  // A list with no height is hidden (a phone's open thread hides the room): nothing there is seen, at the end or not.
  const seesEnd = () => {
    const box = listRef.current;
    return box !== null && box.clientHeight > 0 && atEnd(box);
  };
  const onScroll = () => {
    if (listRef.current !== null) note(listRef.current, anchorRef);
  };
  return { listRef, seesEnd, onScroll };
}
