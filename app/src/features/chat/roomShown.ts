// A room in view on a world's page (slice 4's 4b): the conversation's shape, one RoomView and one Writer whatever it is,
// and what a room is told. Apart from shown.tsx, whose direct messages an account alone has.
import type { Composed } from "@gnoworld/core";
import type { AppState } from "../../store/index.ts";
import { roomLabel } from "./names.ts";
import type { RoomActs } from "./roomActs.ts";
import type { RoomViewProps } from "./RoomView.tsx";
import type { WriterProps } from "./Writer.tsx";

// The conversation in view, one RoomView and one Writer whatever it is: what each is told. Its key, one a
// conversation, keeps each one's drawing, its scroll and whether its reader is at the end, apart (CR10).
export interface Shown {
  kind: "room" | "dm";
  key: string;
  view: Pick<
    RoomViewProps,
    "room" | "partner" | "title" | "note" | "state" | "empty" | "onDelete" | "onDismiss" | "onRead" | "onReact"
  >;
  /** Says what the composer composed in the conversation, an answer to a line (`reply`) or a correction of one (`edit`);
   * `draft` is what its writer typed; whether it went. */
  say: (composed: Composed, draft: string, tags?: { reply?: string; edit?: string }) => boolean;
  writer: Pick<
    WriterProps,
    "room" | "label" | "members" | "onSay" | "slow" | "onTyping" | "refused" | "focus" | "describedBy"
  >;
}

/** The room in view, if any: its id, its state in the store, and what the page lets its reader do in it. */
export interface Room {
  id: string | undefined;
  state: AppState["chat"]["rooms"][string] | undefined;
  acts: RoomActs;
}

// A room's: its label, its description; who is here goes beside it.
export function roomShown(room: string, state: Room["state"], acts: RoomActs): Shown {
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
    say: (composed, _draft, tags) => acts.onSay(composed, tags),
    writer: {
      room,
      members: state?.members ?? [],
      onSay: (composed) => acts.onSay(composed),
      slow: acts.slow,
      onTyping: acts.onTyping,
    },
  };
}
