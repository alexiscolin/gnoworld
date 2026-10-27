// A room's lines (slice 4's 4b, moved out of RoomView.tsx): the newest the store holds (the window), held at the
// newest while the reader is there; a line's text is Markdown (4c), built into elements from an allowlist
// (Message.tsx); one that mentions the reader says so (4d). The message menu (4c, docs/decisions.md 2026-10-26): the
// list is one tab stop, a line, the arrows moving among them; a line pointed at or focused shows its bar.
import type { Line } from "@gnoworld/core";
import type { StreamEvent } from "@gnoworld/schemas";
import { Flash } from "@gnoworld/ui";
import { useLayoutEffect, useRef } from "react";
import { LineActions } from "./LineActions.tsx";
import { useCopy, useRemoval } from "./lineFlash.ts";
import { useLineFocus } from "./lineFocus.ts";
import { LineView } from "./LineView.tsx";
import { useNewMark, useReadAtEnd } from "./reading.ts";
import shared from "./lists.module.css";
import styles from "./RoomView.module.css";

const LINES = [shared["plain"], shared["scrolls"], styles["lines"]].join(" ");

// How near the end, in pixels, the reader still reads the newest line.
const AT_END = 32;

// Whether a list is scrolled to its end, or within AT_END of it.
const atEnd = (box: HTMLElement) => box.scrollHeight - box.scrollTop - box.clientHeight < AT_END;

// The lines held at their newest while the reader is there; once scrolled up, left where the reader is. A room with
// news opens on its New line, `fresh`, once (UX review's U1), and the reader is at the end only if that shows it.
function useNewestInView(lines: readonly Line[], fresh: string | undefined) {
  const listRef = useRef<HTMLOListElement>(null);
  const atEndRef = useRef(true);
  const placedRef = useRef(false);
  useLayoutEffect(() => {
    const box = listRef.current;
    if (box === null) return;
    const item = fresh === undefined || placedRef.current ? null : box.querySelector(":scope > li[data-new]");
    if (item !== null) {
      placedRef.current = true;
      box.scrollTop += item.getBoundingClientRect().top - box.getBoundingClientRect().top;
      atEndRef.current = atEnd(box);
    } else if (atEndRef.current) box.scrollTop = box.scrollHeight;
  }, [lines, fresh]);
  const onScroll = () => {
    if (listRef.current !== null) atEndRef.current = atEnd(listRef.current);
  };
  return { listRef, atEndRef, onScroll };
}

export interface LinesProps {
  /** The room, whose lines have bars; none for a direct message's, which have none. */
  room: string | undefined;
  lines: readonly Line[];
  members: readonly string[];
  /** The reader's address, the lines that mention it marked; none for a guest. */
  me: string | undefined;
  /** The msgid of a line Ergo refused to delete, said until dismissed. */
  refused?: string | undefined;
  /** Whether the chat is connected: a delete that cannot go out says why (U8). */
  connected: boolean;
  /** Deletes a line, the reader's own; whether it went out. */
  onDelete: (id: string) => boolean;
  /** The room's flash said Ergo's refusal of a delete. */
  onDismiss: () => void;
  /** The time of the last line the account read here, Ergo's (4f); none while unknown. */
  read?: string | undefined;
  /** The room's history page came: the New mark waits on it, as a live line may come before it (4f's G1). */
  paged?: boolean;
  /** The room read to its line `id`, the newest, while the reader is at the end and the page shows. */
  onRead?: ((id: string) => void) | undefined;
  /** The room's lines' verdicts, by msgid, from the server's stream (4g). */
  verdicts?: Readonly<Record<string, StreamEvent["state"]>> | undefined;
  /** Whether the reader saves data (ADR-0002 §8): then no player is offered (4g, F893). */
  saving?: boolean;
}

/** The room's flash, then its lines, oldest first, as a list a screen reader hears grow. */
export function Lines({
  room,
  lines,
  members,
  me,
  refused,
  connected,
  onDelete,
  onDismiss,
  read,
  paged = false,
  onRead,
  verdicts,
  saving = false,
}: LinesProps) {
  const fresh = useNewMark(lines, paged ? read : undefined, me);
  const { listRef, atEndRef, onScroll } = useNewestInView(lines, fresh);
  const look = useReadAtEnd(lines, atEndRef, paged ? onRead : undefined);
  const { stop, mounted, on, leave } = useLineFocus(lines, listRef, fresh);
  const { said, setSaid, copy } = useCopy();
  const [deleting, remove] = useRemoval({ lines, refused, connected, onDelete, leave, setSaid });
  // Who a mention may shorten (F812): the members, and the authors in view by their account tag, who proved their
  // key as a member did (F819).
  const known = new Set([...members, ...lines.flatMap(({ account }) => (account === undefined ? [] : [account]))]);
  const actionsOf = (line: Line, room: string) => (
    <LineActions
      line={line}
      room={room}
      me={me}
      deleting={line.id === deleting}
      onCopy={(what) => {
        onDismiss();
        copy(line, what, room);
      }}
      onDelete={remove}
    />
  );
  return (
    <>
      <Flash
        message={
          refused === undefined ? said : { title: "Could not delete the message.", line: "The chat refused it." }
        }
        onClose={() => {
          if (refused === undefined) setSaid(null);
          else onDismiss();
        }}
      />
      <ol
        ref={listRef}
        onScroll={() => {
          onScroll();
          look();
        }}
        {...on}
        aria-label="Messages"
        // How the keyboard moves among the lines, which nothing else tells a screen reader (U14).
        aria-description="Up and down arrows move between messages; Tab reaches a message's actions."
        aria-live="polite"
        aria-relevant="additions"
        className={LINES}
      >
        {lines.map((line) => (
          <LineView
            key={line.id}
            line={line}
            me={me}
            members={known}
            stop={line.id === stop}
            actions={room !== undefined && mounted(line.id) ? actionsOf(line, room) : null}
            fresh={line.id === fresh}
            verdict={verdicts?.[line.id]}
            players={room !== undefined && !saving}
          />
        ))}
      </ol>
    </>
  );
}
