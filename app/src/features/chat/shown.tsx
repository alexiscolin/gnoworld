// The conversation in view on a world's page (slice 4's 4e), one RoomView and one Writer whatever it is: a room's or
// a direct message's, what each is told.
import { Icon } from "@gnoworld/ui";
import type { AppState } from "../../store/index.ts";
import { NOT_ENCRYPTED, PAGE_ONLY, type Dms } from "./Dms.tsx";
import type { DmActs } from "./dmActs.ts";
import { roomLabel, shortAddress } from "./names.ts";
import type { RoomActs } from "./roomActs.ts";
import type { RoomViewProps } from "./RoomView.tsx";
import type { WriterProps } from "./Writer.tsx";
import styles from "./shown.module.css";

// The conversation in view, one RoomView and one Writer whatever it is: what each is told. Its key, one a
// conversation, keeps each one's drawing, its scroll and whether its reader is at the end, apart (CR10).
export interface Shown {
  kind: "room" | "dm";
  key: string;
  view: Pick<
    RoomViewProps,
    "room" | "partner" | "title" | "note" | "state" | "empty" | "onDelete" | "onDismiss" | "onRead" | "onReact"
  >;
  /** Says a draft in the conversation, an answer to a line (`reply`) or a correction of one (`edit`); whether it went. */
  say: (draft: string, tags?: { reply?: string; edit?: string }) => boolean;
  writer: Pick<WriterProps, "room" | "label" | "members" | "onSay" | "onTyping" | "refused" | "focus" | "describedBy">;
}

/** What a direct message's page is told by the page: how it sends, whether its composer takes the focus, and the
 * id of its note, which the composer points at. */
export interface DmPage {
  sayTo: (partner: string, draft: string, tags?: { reply?: string; edit?: string }) => boolean;
  /** The bar's acts, through the link; none in a test that gives none: nothing then goes out. */
  acts?: DmActs | undefined;
  focus: boolean;
  noteId: string;
}

// The conversation's lines, with the reactions to them and what Ergo refused of the page's acts (4d's DM bar).
const stateOf = (dms: Dms): NonNullable<RoomViewProps["state"]> => ({
  lines: dms.lines,
  members: [],
  reactions: dms.reactions,
  refused: dms.acts?.deleted,
  cannotReact: dms.acts?.reacted,
});

// A direct message's (4e): said to be one, its partner named, the address whole in its title (U7); not encrypted, by a
// lock and a word in amber, caution's colour (U6); no one beside it; a line Ergo refused said so.
function dmShown(partner: string, dms: Dms, { sayTo, focus, noteId, acts }: DmPage): Shown {
  const short = shortAddress(partner);
  const { refused } = dms;
  const title = (
    <>
      <span className="label">Direct message with</span> <span title={partner}>{short}</span>
    </>
  );
  const note = (
    <>
      <span className={styles["caution"]}>
        <Icon name="lock" /> {NOT_ENCRYPTED}
      </span>{" "}
      {PAGE_ONLY}
    </>
  );
  return {
    kind: "dm",
    key: `dm:${partner}`,
    // Its lines have the bar (4d's DM bar): a reaction, a reply, an edit and a delete of one's own; no link, no player.
    view: {
      room: undefined,
      partner,
      title,
      note,
      state: stateOf(dms),
      empty: dms.empty,
      onDelete: acts?.onDelete ?? (() => false),
      onDismiss: acts?.onDismiss ?? (() => undefined),
      onReact: acts?.onReact ?? (() => false),
    },
    say: (draft, tags) => sayTo(partner, draft, tags),
    writer: {
      room: partner,
      label: short,
      members: [],
      onSay: (draft) => sayTo(partner, draft),
      refused:
        refused === undefined
          ? undefined
          : {
              ...refused,
              why:
                refused.offline === false
                  ? "Not sent: the chat refused this line."
                  : `Not sent: ${short} is not online.`,
            },
      focus,
      describedBy: noteId,
    },
  };
}

/** What is in view: the direct message ?dm= names; else none when ?dm= names none it can show (U9); else the room. */
export function shownOf(dms: Dms, room: Room, page: DmPage): Shown | undefined {
  if (dms.partner !== undefined) return dmShown(dms.partner, dms, page);
  return dms.problem !== undefined || room.id === undefined ? undefined : roomShown(room.id, room.state, room.acts);
}

/** The room in view, if any: its id, its state in the store, and what the page lets its reader do in it. */
export interface Room {
  id: string | undefined;
  state: AppState["chat"]["rooms"][string] | undefined;
  acts: RoomActs;
}

// A room's: its label, its description; who is here goes beside it.
function roomShown(room: string, state: Room["state"], acts: RoomActs): Shown {
  return {
    kind: "room",
    key: `room:${room}`,
    view: {
      room,
      title: roomLabel(room),
      note: state?.topic,
      state,
      onDelete: acts.onDelete,
      onDismiss: acts.onDismiss,
      onRead: acts.onRead,
      onReact: acts.onReact,
    },
    say: (draft, tags) => acts.onSay(draft, tags),
    writer: { room, members: state?.members ?? [], onSay: (draft) => acts.onSay(draft), onTyping: acts.onTyping },
  };
}
