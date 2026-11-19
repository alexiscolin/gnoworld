// A room's list opens at its end and stays there with no script: its scroll origin is its foot (RoomView.module.css, `.fill`:
// column-reverse), so what grows above never moves the end. What is left here is a reader's own place: a reader scrolled up keeps
// their lines still as something below them grows (the browser's scroll anchoring is off there: WebKit has none).
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Fling } from "./fling.ts";

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
  const [awaiting, setAwaiting] = useState(false);
  useLayoutEffect(() => {
    const box = listRef.current;
    const unfilled = box?.querySelector(UNFILLED);
    if (box === null || unfilled === null || unfilled === undefined) return;
    const watch = new MutationObserver(() => {
      if (box.querySelector(UNFILLED) === null) show();
    });
    const latest = setTimeout(show, CARDS_WAIT_MS);
    function show() {
      watch.disconnect();
      clearTimeout(latest);
      setAwaiting(false);
    }
    setAwaiting(true);
    watch.observe(box, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-busy", "data-markets"],
    });
    return show;
  }, [listRef]);
  return awaiting;
}

interface Anchor {
  current: { line: Element; top: number; scroll: number } | undefined;
}

// The first line the reader sees (a search from the one noted before), noted with its top in the box and the box's scroll.
function note(box: HTMLElement, anchor: Anchor) {
  const top = box.getBoundingClientRect().top;
  const seen = (line: Element) => line.getBoundingClientRect().bottom > top;
  let line = anchor.current?.line.isConnected === true ? anchor.current.line : box.firstElementChild?.firstElementChild;
  while (line?.previousElementSibling && seen(line.previousElementSibling)) line = line.previousElementSibling;
  while (line && !seen(line)) line = line.nextElementSibling;
  if (line) anchor.current = { line, top: line.getBoundingClientRect().top - top, scroll: box.scrollTop };
}

// A reader scrolled up keeps the line they see where it was: what the scroll explains is theirs, the rest (a card grown under the line, a
// box shrunk) is undone. While their scroll goes on nothing is written to it (iOS stops its momentum): the rest is owed to the fling.
function keep(box: HTMLElement, anchor: Anchor, fling: Fling) {
  const moved = movedLine(box, anchor);
  if (fling.moving) fling.owe(moved);
  else if (Math.abs(moved) >= 1) box.scrollTop += moved;
  note(box, anchor);
}

// How far the line the reader sees was moved by what the scroll does not explain (0 for a reader at the end, whom the foot holds).
function movedLine(box: HTMLElement, anchor: Anchor): number {
  const noted = anchor.current;
  if (noted?.line.isConnected !== true || atEnd(box)) return 0;
  return (
    noted.line.getBoundingClientRect().top - box.getBoundingClientRect().top - noted.top + box.scrollTop - noted.scroll
  );
}

/** The list of a room: it opens on its New line when there is one (`fresh`), else at its end (CSS). A reader scrolled up keeps
 * their place as a line, a card or an image grows under them, or the box shrinks: the first line they see is kept where it is
 * (the box's first child is the list). */
export function useNewestInView({ fresh }: { fresh: string | undefined }) {
  const listRef = useRef<HTMLDivElement>(null);
  const placedRef = useRef(false);
  const anchorRef: Anchor = useRef(undefined);
  const awaiting = useCardsAwaited(listRef);
  const flingRef = useRef<Fling>(undefined);
  const frameRef = useRef<number>(undefined);
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
    const fling = new Fling((owed) => {
      // What grew since the last frame's note is owed too; a reader who flicked back to the end is held by the foot: nothing is owed.
      const total = atEnd(box) ? 0 : owed + movedLine(box, anchorRef);
      if (Math.abs(total) >= 1) box.scrollTop += total;
      note(box, anchorRef);
    });
    flingRef.current = fling;
    const watch = new ResizeObserver(() => {
      keep(box, anchorRef, fling);
    });
    watch.observe(list);
    watch.observe(box);
    const signal = new AbortController();
    box.addEventListener(
      "scrollend",
      () => {
        fling.ended();
      },
      { signal: signal.signal },
    );
    // A finger is down while any touch is: one of two lifted leaves the list touched.
    for (const type of ["touchstart", "touchend", "touchcancel"] as const)
      box.addEventListener(
        type,
        (event) => {
          fling.touching(event.touches.length > 0);
        },
        { passive: true, signal: signal.signal },
      );
    return () => {
      watch.disconnect();
      signal.abort();
      fling.stop();
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    };
  }, []);
  // A list with no height is hidden (a phone's open thread hides the room): nothing there is seen, at the end or not.
  const seesEnd = () => {
    const box = listRef.current;
    return box !== null && box.clientHeight > 0 && atEnd(box);
  };
  // A scroll writes nothing and reads nothing in its listener: it says the reader's goes on, and the line they see is noted again once a
  // frame (a growth above the view moves nothing, so the line kept must be near it); what a growth asks of the scroll is owed to the fling.
  const onScroll = () => {
    const fling = flingRef.current;
    if (fling === undefined) return;
    fling.scrolled();
    if (frameRef.current !== undefined) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = undefined;
      if (listRef.current !== null) keep(listRef.current, anchorRef, fling);
    });
  };
  return { listRef, seesEnd, onScroll, awaiting };
}
