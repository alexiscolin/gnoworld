// A room's reading place on its page (Ergo's draft/read-marker): the line marked New while the room is
// open, and the room marked read to its newest line while the reader is at the end and the page shows.
import { newMarkAfter, type Line, type NewMark, type Reaction } from "@gnoworld/core";
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type RefObject } from "react";

/** The msgid of the line marked New: the first past the place once the room holds lines and the place is known, kept
 * while the room is open, as the place moves on and lines come; moved to the line a reader asks to go back to (the
 * device's place `unread`, which only the earlier of it and Ergo's `read` decides from). */
function useNewMark(
  lines: readonly Line[],
  places: { read: string | undefined; unread: string | undefined },
  me: string | undefined,
) {
  const [mark, setMark] = useState<NewMark>();
  const shown = newMarkAfter(mark, { lines, ...places }, me ?? "");
  // Decided in this render: kept as the component's own state at once (React's update while rendering).
  if (shown !== mark) setMark(shown);
  return shown?.id;
}

/** Marks the room read to its newest line while the reader is at the end and the page shows: as a line comes, as the
 * tab shows again, as `onRead` comes (none until the room's history came), and through the look it gives back,
 * which the list calls as it scrolls. */
function useReadAtEnd(lines: readonly Line[], seesEnd: () => boolean, onRead: ((id: string) => void) | undefined) {
  const newest = lines.at(-1)?.id;
  const look = () => {
    if (newest !== undefined && seesEnd() && document.visibilityState === "visible") onRead?.(newest);
  };
  const seen = useEffectEvent(look);
  const reading = onRead !== undefined;
  // The tab shown again: one listener a page, not one a line.
  useEffect(() => {
    const shows = () => {
      seen();
    };
    document.addEventListener("visibilitychange", shows);
    return () => {
      document.removeEventListener("visibilitychange", shows);
    };
  }, []);
  useEffect(() => {
    seen();
  }, [newest, reading]);
  return look;
}

/** What reading to the end does in a room: Ergo told the newest line read (`onRead`), and the device's place for the
 * room forgotten, but only when the view was opened with it: the reader who marks a line unread at the end of the
 * room keeps the mark until the next time it is read through, never losing it at once. None until the history came. */
export function useReading({
  lines,
  seesEnd,
  paged,
  onRead,
  keeping,
}: {
  lines: readonly Line[];
  seesEnd: () => boolean;
  paged: boolean;
  onRead: ((id: string) => void) | undefined;
  keeping: { unread: string | undefined; onReadThrough: () => void } | undefined;
}) {
  const [opened] = useState(keeping?.unread !== undefined);
  return useReadAtEnd(
    lines,
    seesEnd,
    paged
      ? (id) => {
          onRead?.(id);
          // Only while the room holds a place: once it is forgotten, a mark another tab sets stays.
          if (opened && keeping?.unread !== undefined) keeping.onReadThrough();
        }
      : undefined,
  );
}

/** Calls `look` each time the list's box changes size: one a phone's panel hid (no height) and Close shows again at its
 * end is read then, the lines that came meanwhile. A page with no ResizeObserver has no panel to close. */
function useLookWhenResized(listRef: RefObject<HTMLElement | null>, look: () => void) {
  const seen = useEffectEvent(look);
  useEffect(() => {
    const box = listRef.current;
    if (box === null || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(() => {
      seen();
    });
    watch.observe(box);
    return () => {
      watch.disconnect();
    };
  }, [listRef]);
}

// How near the end, in pixels, the reader still reads the newest line.
const AT_END = 32;

// Whether a list is scrolled to its end, or within AT_END of it.
const atEnd = (box: HTMLElement) => box.scrollHeight - box.scrollTop - box.clientHeight < AT_END;

// Moves a list to its end, and notes where that is.
const toEnd = (box: HTMLElement, top: { current: number }) => {
  box.scrollTop = box.scrollHeight;
  top.current = box.scrollTop;
};

// The lines held at their newest while the reader is there, as a line comes or a reaction grows one;
// once scrolled up, left where the reader is. A room with news opens on its New line, `fresh`, once,
// and the reader is at the end only if that shows it.
function useNewestInView(
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
    else if (box.scrollTop !== topRef.current) atEndRef.current = false;
  };
  // A list with no height is hidden (a phone's open thread hides the room): nothing there is seen, at the end or not.
  const seesEnd = () => atEndRef.current && (listRef.current?.clientHeight ?? 0) > 0;
  return { listRef, seesEnd, onScroll };
}

// The list held at its newest and the room read to it: what a scroll or a change of the list's size does to both.
function useListReading(
  list: Pick<Parameters<typeof useReading>[0], "lines" | "paged" | "onRead" | "keeping"> & {
    fresh: string | undefined;
    reactions: readonly Reaction[] | undefined;
  },
) {
  const { listRef, seesEnd, onScroll } = useNewestInView(list.lines, list.fresh, list.reactions);
  const look = useReading({
    lines: list.lines,
    seesEnd,
    paged: list.paged,
    onRead: list.onRead,
    keeping: list.keeping,
  });
  useLookWhenResized(listRef, look);
  return {
    listRef,
    onScroll: () => {
      onScroll();
      look();
    },
  };
}

// Where the reader left the room, once its history page came: Ergo's reading place, or the account's own mark.
const placeOf = (paged: boolean, read: string | undefined, unread: string | undefined) =>
  paged ? { read, unread } : { read: undefined, unread: undefined };

/** What a list reads of its room: the line marked New, the list held at its newest and the room read to it. */
export function useListRead(list: {
  lines: readonly Line[];
  me: string | undefined;
  reactions?: readonly Reaction[] | undefined;
  read?: string | undefined;
  paged?: boolean | undefined;
  onRead?: ((id: string) => void) | undefined;
  keeping?: Parameters<typeof useReading>[0]["keeping"];
}) {
  const { lines, me, reactions, read, paged = false, onRead, keeping } = list;
  const fresh = useNewMark(lines, placeOf(paged, read, keeping?.unread), me);
  return { fresh, ...useListReading({ lines, fresh, reactions, paged, onRead, keeping }) };
}
