// A line's actions (slice 4's 4c, 4d; docs/decisions.md, 2026-10-26): the prototype's bar, an account's three quick
// reactions first and a Pin button for a reader who may pin (4d), its More menu holding Copy text, Copy link, Open
// thread (4d's threads), Save message and Mark unread for an account and, on the reader's own line, Delete, asked
// first. More reactions and edit come with their merges; Report waits for slice 12's moderation queue.
import type { Line, Shown } from "@gnoworld/core";
import { Button, Chip, Cluster, Dialog, IconButton, Menu, Stack } from "@gnoworld/ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./LineActions.module.css";
import { keptItems, PinButton, type LineKeeping } from "./LineKeeping.tsx";
import { menuItems } from "./menuItems.ts";
import { roomLabel } from "./names.ts";

// What the delete's dialog quotes of its line: its first 80 characters, never one cut in two (an emoji's parts).
const QUOTED = 80;
function quoted(text: string): string {
  const characters = Array.from(new Intl.Segmenter().segment(text), ({ segment }) => segment);
  return characters.length > QUOTED ? `${characters.slice(0, QUOTED).join("")}…` : text;
}

// The prototype's three quick reactions (docs/prototype/source/app.js, withActions).
const QUICK = ["👍", "❤️", "😂"];

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
  /** What an account keeps of it (4d); none for a guest, who has no device to keep it on. */
  keeping?: LineKeeping | undefined;
  /** The line's reactions as shown: the quick reactions the reader gave show pressed. */
  reactions?: readonly Shown[] | undefined;
  /** Reacts to the line with an emoji, or takes the reaction back; whether it went out. */
  onReact: (emoji: string, on: boolean) => boolean;
  /** Makes the line the one the composer's next answers (4d). */
  onReply: () => void;
  /** Opens the thread the line is in, or starts one (4d's threads); none: no item. */
  onThread?: ((id: string) => void) | undefined;
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

// An account's quick reactions, each pressed when the reader gave it, pressed again to take it back. Wide, three chips;
// narrow (the line's column under what the five controls need), one React menu of the same three, as the bar stands
// on one row there (U1; LineActions.module.css).
function QuickReactions({ given, onReact }: { given: ReadonlySet<string>; onReact: LineActionsProps["onReact"] }) {
  const toggle = (emoji: string) => {
    onReact(emoji, !given.has(emoji));
  };
  return (
    <>
      <span className={styles["quick"]}>
        {QUICK.map((emoji) => (
          <Chip
            key={emoji}
            label={`React with ${emoji}`}
            selected={given.has(emoji)}
            onClick={() => {
              toggle(emoji);
            }}
          >
            {emoji}
          </Chip>
        ))}
      </span>
      <span className={styles["react"]}>
        <Menu
          trigger="React"
          icon="smile"
          emphasis="plain"
          size="s"
          label="Reactions"
          items={QUICK.map((emoji) => ({
            label: `${given.has(emoji) ? "Take back" : "React with"} ${emoji}`,
            onSelect: () => {
              toggle(emoji);
            },
          }))}
        />
      </span>
    </>
  );
}

// What an account answers a line with: the quick reactions, the ones it gave pressed, and Reply (4d).
function Answering({ reactions, onReact, onReply }: Pick<LineActionsProps, "reactions" | "onReact" | "onReply">) {
  const given = new Set(reactions?.flatMap(({ emoji, mine }) => (mine ? [emoji] : [])));
  return (
    <>
      <QuickReactions given={given} onReact={onReact} />
      <IconButton icon="reply" label="Reply" size="s" emphasis="plain" onClick={onReply} />
    </>
  );
}

/** The bar of a line pointed at or focused, out of the list's live announcements: its More menu, and the dialog
 * that asks before a delete, which gives the focus back to More when it closes. */
export function LineActions({
  line,
  room,
  me,
  onCopy,
  onDelete,
  deleting = false,
  keeping,
  reactions,
  onReact,
  onReply,
  onThread,
}: LineActionsProps) {
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
  const items = menuItems(
    {
      onCopy,
      onThread,
      kept: keptItems(line, own, keeping),
      onDelete:
        own && !deleting
          ? () => {
              setAsking(true);
            }
          : undefined,
    },
    line.id,
  );
  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label="Actions on this message"
      aria-live="off"
      className={styles["bar"]}
      data-inside={inside ? "" : undefined}
    >
      {me === undefined ? null : <Answering reactions={reactions} onReact={onReact} onReply={onReply} />}
      <PinButton line={line} pin={keeping?.pin} />
      <Menu trigger="More actions" icon="more" emphasis="plain" size="s" label="Message actions" items={items} />
      {own ? <AskDelete line={line} room={room} open={asking} close={close} /> : null}
    </div>
  );
}
