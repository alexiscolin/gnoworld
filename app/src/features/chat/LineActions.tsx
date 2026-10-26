// A line's actions (slice 4's 4c; docs/decisions.md, 2026-10-26): the prototype's bar, its More menu holding Copy
// text, Copy link and, on the reader's own line, Delete, asked first. Reactions, reply, thread, pin, save, edit and
// mark unread come with their merges; Report waits for slice 12's moderation queue.
import type { Line } from "@gnoworld/core";
import { Button, Cluster, Dialog, Menu, Stack } from "@gnoworld/ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./LineActions.module.css";
import { roomLabel } from "./names.ts";

// What the delete's dialog quotes of its line: its first 80 characters, never one cut in two (an emoji's parts).
const QUOTED = 80;
function quoted(text: string): string {
  const characters = Array.from(new Intl.Segmenter().segment(text), ({ segment }) => segment);
  return characters.length > QUOTED ? `${characters.slice(0, QUOTED).join("")}…` : text;
}

// A bar that would rise past the top of the list that scrolls comes down inside its line, as it shows (U10).
function useInside() {
  const barRef = useRef<HTMLDivElement>(null);
  const [inside, setInside] = useState(false);
  useLayoutEffect(() => {
    const bar = barRef.current;
    const list = bar?.closest("ol");
    if (bar != null && list != null) setInside(bar.getBoundingClientRect().top < list.getBoundingClientRect().top);
  }, []);
  return { barRef, inside };
}

export interface LineActionsProps {
  line: Line;
  room: string;
  /** The reader's address; none for a guest. */
  me: string | undefined;
  /** Copies the line's text, or the room's link. */
  onCopy: (what: "text" | "link") => void;
  /** Deletes the line, the reader's own; whether it went out. */
  onDelete: (id: string) => boolean;
  /** Its delete went out, not answered yet: no second one (U4). */
  deleting?: boolean;
}

// The dialog that asks before a delete: which line, where, and that it cannot come back; `close` says whether to delete.
function AskDelete({
  line,
  room,
  open,
  close,
}: {
  line: Line;
  room: string;
  open: boolean;
  close: (go: boolean) => void;
}) {
  return (
    <Dialog
      title="Delete message?"
      description={quoted(line.text)}
      open={open}
      onClose={() => {
        close(false);
      }}
    >
      <Stack space="s">
        <p>It leaves {roomLabel(room)} for everyone, and cannot come back.</p>
        <Cluster justify="end">
          <Button
            emphasis="outline"
            onClick={() => {
              close(false);
            }}
          >
            Keep it
          </Button>
          <Button
            tone="danger"
            onClick={() => {
              close(true);
            }}
          >
            Delete message
          </Button>
        </Cluster>
      </Stack>
    </Dialog>
  );
}

/** The bar of a line pointed at or focused, out of the list's live announcements: its More menu, and the dialog
 * that asks before a delete, which gives the focus back to More when it closes. */
export function LineActions({ line, room, me, onCopy, onDelete, deleting = false }: LineActionsProps) {
  const [asking, setAsking] = useState(false);
  const { barRef, inside } = useInside();
  // A delete asked, sent after the dialog's close, which gives the focus back to More (Menu hands it there first).
  const deletingRef = useRef(false);
  // Two missing values are no match: a guest's line has no account tag, a guest no address (M1).
  const own = me !== undefined && line.account === me;
  // After the dialog's own close, as this effect runs after its: the line goes, handing the focus to a neighbour, or
  // stays, the delete unsent, the focus on More.
  useEffect(() => {
    if (asking || !deletingRef.current) return;
    deletingRef.current = false;
    onDelete(line.id);
  }, [asking, onDelete, line.id]);
  const close = (deleting: boolean) => {
    deletingRef.current = deleting;
    setAsking(false);
  };
  const items = [
    {
      label: "Copy text",
      onSelect: () => {
        onCopy("text");
      },
    },
    {
      label: "Copy room link",
      onSelect: () => {
        onCopy("link");
      },
    },
    ...(own && !deleting
      ? [
          {
            label: "Delete",
            tone: "danger" as const,
            onSelect: () => {
              setAsking(true);
            },
          },
        ]
      : []),
  ];
  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label="Actions on this message"
      aria-live="off"
      className={styles["bar"]}
      data-inside={inside ? "" : undefined}
    >
      <Menu trigger="More actions" icon="more" emphasis="plain" size="s" label="Message actions" items={items} />
      {own ? <AskDelete line={line} room={room} open={asking} close={close} /> : null}
    </div>
  );
}
