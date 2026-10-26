// A line's actions (slice 4's 4c; docs/decisions.md, 2026-10-26): the prototype's bar, its More menu holding Copy
// text, Copy link and, on the reader's own line, Delete, asked first. Reactions, reply, thread, pin, save, edit and
// mark unread come with their merges; Report waits for slice 12's moderation queue.
import type { Line } from "@gnoworld/core";
import { Button, Cluster, Dialog, Menu, Stack } from "@gnoworld/ui";
import { useEffect, useRef, useState } from "react";
import styles from "./LineActions.module.css";
import { roomLabel } from "./names.ts";

export interface LineActionsProps {
  line: Line;
  room: string;
  /** The reader's address; none for a guest. */
  me: string | undefined;
  /** Copies the line's text, or the room's link. */
  onCopy: (what: "text" | "link") => void;
  /** Deletes the line, the reader's own; whether it went out. */
  onDelete: (id: string) => boolean;
}

/** The bar of a line pointed at or focused, out of the list's live announcements: its More menu, and the dialog
 * that asks before a delete, which gives the focus back to More when it closes. */
export function LineActions({ line, room, me, onCopy, onDelete }: LineActionsProps) {
  const [asking, setAsking] = useState(false);
  // What follows the dialog's close: More takes the focus back, or the line goes.
  const afterRef = useRef<"back" | "delete">(undefined);
  const barRef = useRef<HTMLDivElement>(null);
  // Two missing values are no match: a guest's line has no account tag, a guest no address (M1).
  const own = me !== undefined && line.account === me;
  // After the dialog's own close, which hands the focus to the menu's hidden item: the line goes, which hands it to a
  // neighbour, or More takes it back, the dialog closed or the delete unsent. This effect runs after the dialog's.
  useEffect(() => {
    const after = afterRef.current;
    if (asking || after === undefined) return;
    afterRef.current = undefined;
    if (after === "delete" && onDelete(line.id)) return;
    barRef.current?.querySelector<HTMLElement>("[aria-haspopup='menu']")?.focus();
  }, [asking, onDelete, line.id]);
  const close = (after: "back" | "delete") => {
    afterRef.current = after;
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
    ...(own
      ? [
          {
            label: "Delete",
            onSelect: () => {
              setAsking(true);
            },
          },
        ]
      : []),
  ];
  return (
    <div ref={barRef} role="toolbar" aria-label="Message actions" aria-live="off" className={styles["bar"]}>
      <Menu trigger="More" icon="more" emphasis="plain" label="Message actions" items={items} />
      {own ? (
        <Dialog
          title="Delete this message?"
          open={asking}
          onClose={() => {
            close("back");
          }}
        >
          <Stack space="s">
            <p>It leaves {roomLabel(room)} for everyone, and cannot come back.</p>
            <Cluster justify="end">
              <Button
                emphasis="outline"
                onClick={() => {
                  close("back");
                }}
              >
                Keep it
              </Button>
              <Button
                tone="danger"
                onClick={() => {
                  close("delete");
                }}
              >
                Delete
              </Button>
            </Cluster>
          </Stack>
        </Dialog>
      ) : null}
    </div>
  );
}
