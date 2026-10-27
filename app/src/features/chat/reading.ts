// A room's reading place on its page (slice 4's 4f, Ergo's draft/read-marker): the line marked New while the room is
// open, and the room marked read to its newest line while the reader is at the end and the page shows.
import { newMarkAfter, type Line, type NewMark } from "@gnoworld/core";
import { useEffect, useEffectEvent, useState, type RefObject } from "react";

/** The msgid of the line marked New: the first past the place once the room holds lines and the place is known, kept
 * while the room is open, as the place moves on and lines come; moved to the line a reader asks to go back to (4d: the
 * device's place `unread`, which only the earlier of it and Ergo's `read` decides from). */
export function useNewMark(
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

/** Calls `onHide` each time the page hides. */
export function useOnHide(onHide: () => void) {
  const hidden = useEffectEvent(onHide);
  useEffect(() => {
    const hides = () => {
      if (document.visibilityState === "hidden") hidden();
    };
    document.addEventListener("visibilitychange", hides);
    return () => {
      document.removeEventListener("visibilitychange", hides);
    };
  }, []);
}

/** Marks the room read to its newest line while the reader is at the end and the page shows: as a line comes, as the
 * tab shows again, as `onRead` comes (none until the room's history came: 4f's G1), and through the look it gives back,
 * which the list calls as it scrolls. */
function useReadAtEnd(
  lines: readonly Line[],
  atEndRef: RefObject<boolean>,
  onRead: ((id: string) => void) | undefined,
) {
  const newest = lines.at(-1)?.id;
  const look = () => {
    if (newest !== undefined && atEndRef.current && document.visibilityState === "visible") onRead?.(newest);
  };
  const seen = useEffectEvent(look);
  const reading = onRead !== undefined;
  // The tab shown again: one listener a page, not one a line (E5).
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
 * room forgotten, but only when the view was opened with it (4d): the reader who marks a line unread at the end of the
 * room keeps the mark until the next time it is read through, never losing it at once. None until the history came. */
export function useReading({
  lines,
  atEndRef,
  paged,
  onRead,
  keeping,
}: {
  lines: readonly Line[];
  atEndRef: RefObject<boolean>;
  paged: boolean;
  onRead: ((id: string) => void) | undefined;
  keeping: { unread: string | undefined; onReadThrough: () => void } | undefined;
}) {
  const [opened] = useState(keeping?.unread !== undefined);
  return useReadAtEnd(
    lines,
    atEndRef,
    paged
      ? (id) => {
          onRead?.(id);
          // Only while the room holds a place: once it is forgotten, a mark another tab sets stays (F1470).
          if (opened && keeping?.unread !== undefined) keeping.onReadThrough();
        }
      : undefined,
  );
}
