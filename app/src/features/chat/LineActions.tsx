// A line's actions (slice 4's 4c, 4d; docs/decisions.md, 2026-10-26): the prototype's bar, an account's three quick
// reactions, Reply and a Pin button for a reader who may pin, its More menu holding Copy
// text, Copy link, Open thread, View profile, Save message and Mark unread for an account, Edit and, on the reader's
// own line, Delete, asked first. More reactions come with their merges; Report waits for slice 12's moderation queue.
import { canEdit, type Line, type Shown } from "@gnoworld/core";
import { Menu } from "@gnoworld/ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./LineActions.module.css";
import { AskDelete } from "./AskDelete.tsx";
import { AskModerate } from "./AskModerate.tsx";
import { Reacting, Shortcuts, type Need } from "./BarButtons.tsx";
import { openAuthorCard } from "./LineHead.tsx";
import { keptItems, moderationItems, PinButton, type LineKeeping } from "./LineKeeping.tsx";
import { menuItems } from "./menuItems.ts";
import { roomLabel, shortAddress } from "./names.ts";

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
  /** The room the line is in; none for a direct message's. */
  room?: string | undefined;
  /** The partner of the direct message the line is in (4d's DM bar); none for a room's. */
  dm?: string | undefined;
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
  /** Puts the line's words in the composer to correct them; given by a view that has edits. */
  onEdit?: (() => void) | undefined;
  /** What a guest presses that needs an account: says where to connect. Given for a guest alone. */
  onNeed?: ((need: Need) => void) | undefined;
  /** Opens the More menu now at this point, as a right-click's does; each new object asks once. */
  menuAt?: { x: number; y: number } | undefined;
}

// Whether Edit is offered: an Edit to ask for, and canEdit's rule, which the composer holds as well (CR5).
const asksEdit = (onEdit: (() => void) | undefined, line: Line, me: string | undefined) =>
  onEdit !== undefined && canEdit(line, me);

// Where a deleted line leaves, as the dialog says it.
const placeOf = (room: string, dm: string | undefined) =>
  dm === undefined ? `${roomLabel(room)} for everyone` : `your conversation with ${shortAddress(dm)} for both of you`;

// The More menu's items for a line: what its conversation, its reader and a delete under way allow.
function itemsOf(
  props: Pick<LineActionsProps, "line" | "dm" | "me" | "onCopy" | "onThread" | "onEdit" | "keeping">,
  { own, deleting }: { own: boolean; deleting: boolean },
  asks: { delete: () => void; moderate: (act: "hide" | "mute") => void },
) {
  const { line, dm, me, onCopy, onThread, onEdit, keeping } = props;
  return menuItems(
    {
      onCopy,
      link: dm === undefined,
      onThread,
      onCard: openAuthorCard,
      kept: [...keptItems(line, own, keeping), ...moderationItems({ line, own, keeping }, asks.moderate)],
      onEdit: asksEdit(onEdit, line, me) && !deleting ? onEdit : undefined,
      onDelete: own && !deleting ? asks.delete : undefined,
    },
    line.id,
  );
}

// The emoji the reader has already put on a line.
const givenOf = (reactions: LineActionsProps["reactions"]) =>
  new Set(reactions?.flatMap(({ emoji, mine }) => (mine ? [emoji] : [])));

// The ask before a hide or a mute, when the room's keeping offers them: its answer runs the one asked.
function Moderating({
  line,
  act,
  moderate,
  done,
}: {
  line: Line;
  act: "hide" | "mute" | undefined;
  moderate: NonNullable<LineActionsProps["keeping"]>["moderate"];
  done: () => void;
}) {
  if (moderate === undefined) return null;
  return (
    <AskModerate
      line={line}
      act={act}
      close={(go) => {
        if (go) (act === "hide" ? moderate.onHide : moderate.onMute)();
        done();
      }}
    />
  );
}

/** The bar of a line pointed at or focused, out of the list's live announcements: its More menu, and the dialog
 * that asks before a delete, which gives the focus back to More when it closes. */
export function LineActions({
  line,
  room = "",
  dm,
  me,
  onCopy,
  onDelete,
  deleting = false,
  keeping,
  reactions,
  onReact,
  onReply,
  onThread,
  onEdit,
  onNeed,
  menuAt,
}: LineActionsProps) {
  const [asking, setAsking] = useState(false);
  const [moderating, setModerating] = useState<"hide" | "mute" | undefined>(undefined);
  const { barRef, inside } = useInside();
  // A delete asked, sent after the dialog's close, which gives the focus back to More (Menu hands it there first).
  const deletingRef = useRef(false);
  // Two missing values are no match: a guest's line has no account tag, a guest no address (M1).
  const own = me !== undefined && line.account === me;
  const given = givenOf(reactions);
  const needs = me === undefined ? onNeed : undefined;
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
  const items = itemsOf(
    { line, dm, me, onCopy, onThread, onEdit, keeping },
    { own, deleting },
    {
      delete: () => {
        setAsking(true);
      },
      moderate: setModerating,
    },
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
      <Reacting given={given} onReact={onReact} onNeed={needs} />
      <Shortcuts {...{ line, dm, onCopy, onThread, onNeed: needs, onReply }} />
      <PinButton line={line} pin={keeping?.pin} />
      <Menu
        trigger="More actions"
        icon="more"
        emphasis="plain"
        size="xs"
        label="Message actions"
        items={items}
        at={menuAt}
      />
      <Moderating
        line={line}
        act={moderating}
        moderate={keeping?.moderate}
        done={() => {
          setModerating(undefined);
        }}
      />
      {own ? <AskDelete line={line} place={placeOf(room, dm)} open={asking} close={close} /> : null}
    </div>
  );
}
