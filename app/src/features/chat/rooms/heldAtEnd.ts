// A room's list held at its end (its newest line) while the reader is there: as a line comes, as a card, a preview or an image
// grows one, as the composer takes room. Once the reader scrolls up, the list is left where they are.
import type { Line, Reaction } from "@gnoworld/core";
import { useEffect, useLayoutEffect, useRef } from "react";

// How near the end, in pixels, the reader still reads the newest line.
const AT_END = 32;

// Whether a list is scrolled to its end, or within AT_END of it.
const atEnd = (box: HTMLElement) => box.scrollHeight - box.scrollTop - box.clientHeight < AT_END;

// A list held at its end anchors no scroll: a line that grows above then moves it in no engine, as in WebKit, and the place
// noted is the place found. Let go, it anchors again, so a reader up the room keeps their lines still.
const hold = (box: HTMLElement, held: boolean) => {
  box.style.setProperty("overflow-anchor", held ? "none" : "");
};

// Moves a list to its end, and notes where that is.
const toEnd = (box: HTMLElement, top: { current: number }) => {
  hold(box, true);
  box.scrollTop = box.scrollHeight;
  top.current = box.scrollTop;
};

// The lines held at their newest while the reader is there, as a line comes or a reaction grows one;
// once scrolled up, left where the reader is. A room with news opens on its New line, `fresh`, once,
// and the reader is at the end only if that shows it.
export function useNewestInView(
  lines: readonly Line[],
  fresh: string | undefined,
  reactions: readonly Reaction[] | undefined,
) {
  const listRef = useRef<HTMLOListElement>(null);
  const atEndRef = useRef(true);
  const placedRef = useRef(false);
  // Where this hook last moved the list.
  const topRef = useRef(0);
  useLayoutEffect(() => {
    const box = listRef.current;
    if (box === null) return;
    const item = fresh === undefined || placedRef.current ? null : box.querySelector(":scope > li[data-new]");
    if (item !== null) {
      placedRef.current = true;
      box.scrollTop += item.getBoundingClientRect().top - box.getBoundingClientRect().top;
      atEndRef.current = atEnd(box);
      hold(box, atEndRef.current);
      topRef.current = box.scrollTop;
    } else if (atEndRef.current) toEnd(box, topRef);
  }, [lines, fresh, reactions]);
  // The list shrinks as the composer grows (a six-line draft), and a line grows as its card, preview or image comes: no
  // scroll event comes for either, so a reader at the end is kept there by the new size, else the newest lines are lost
  // under the composer or below the fold. The box and each line are watched; a line that comes is watched as it does.
  useEffect(() => {
    const box = listRef.current;
    if (box === null || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(() => {
      if (atEndRef.current) toEnd(box, topRef);
    });
    watch.observe(box);
    for (const line of box.children) watch.observe(line);
    const added = new MutationObserver((changes) => {
      for (const change of changes)
        for (const node of change.addedNodes) if (node instanceof Element) watch.observe(node);
    });
    added.observe(box, { childList: true });
    return () => {
      added.disconnect();
      watch.disconnect();
    };
  }, []);
  // A scroll is told a frame after its move, and a card may have grown the list since (WebKit anchors no scroll): off the
  // end but where this hook put it, the list was moved by no reader.
  const onScroll = () => {
    const box = listRef.current;
    if (box === null) return;
    if (atEnd(box)) atEndRef.current = true;
    // A pixel or more: a phone may tell a place snapped to its own pixels.
    else if (Math.abs(box.scrollTop - topRef.current) >= 1) atEndRef.current = false;
    hold(box, atEndRef.current);
  };
  // A list with no height is hidden (a phone's open thread hides the room): nothing there is seen, at the end or not.
  const seesEnd = () => atEndRef.current && (listRef.current?.clientHeight ?? 0) > 0;
  return { listRef, seesEnd, onScroll };
}
