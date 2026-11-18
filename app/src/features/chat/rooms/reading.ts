// A room's reading place on its page (Ergo's draft/read-marker): the line marked New while the room is
// open, and the room marked read to its newest line while the reader is at the end and the page shows.
import { newMarkAfter, type Line, type NewMark } from "@gnoworld/core";
import { useEffect, useEffectEvent, useState, type RefObject } from "react";
import { useNewestInView } from "./heldAtEnd.ts";

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

// The list opened on its New line or at its end, and the room read to its end: what a scroll or a change of the list's size does.
function useListReading(
  list: Pick<Parameters<typeof useReading>[0], "lines" | "paged" | "onRead" | "keeping"> & {
    fresh: string | undefined;
  },
) {
  const { listRef, seesEnd, onScroll, awaiting } = useNewestInView({ fresh: list.fresh });
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
    awaiting,
    onScroll: () => {
      onScroll();
      look();
    },
  };
}

// Where the reader left the room, once its history page came: Ergo's reading place, or the account's own mark.
const placeOf = (paged: boolean, read: string | undefined, unread: string | undefined) =>
  paged ? { read, unread } : { read: undefined, unread: undefined };

/** What a list reads of its room: the line marked New, the list opened there or at its end, and the room read to it. */
export function useListRead(list: {
  lines: readonly Line[];
  me: string | undefined;
  read?: string | undefined;
  paged?: boolean | undefined;
  onRead?: ((id: string) => void) | undefined;
  keeping?: Parameters<typeof useReading>[0]["keeping"];
}) {
  const { lines, me, read, paged = false, onRead, keeping } = list;
  const fresh = useNewMark(lines, placeOf(paged, read, keeping?.unread), me);
  return { fresh, ...useListReading({ lines, fresh, paged, onRead, keeping }) };
}
