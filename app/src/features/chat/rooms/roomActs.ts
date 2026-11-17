// What the room in view lets its reader do through the page's link, built from the room and the
// link alone: a line, a typist or a place changing the room's state keeps them, and the lines' view its drawing (a
// typist's refresh costs 0.55-0.93 ms at 200 lines, 0.025-0.044 ms with them kept).
import type { Composed, Reacting } from "@gnoworld/core";
import type { RefObject } from "react";
import type { ChatLink } from "../connection/link.ts";

export type RoomActs = ReturnType<typeof roomActs>;

/** Whether the link sends a message of several lines whole: yes while there is no link yet. */
export const multilineOf = (link: RefObject<ChatLink | undefined>): boolean => link.current?.multiline() ?? true;

export function roomActs(link: RefObject<ChatLink | undefined>, room: string, dismissed: (room: string) => void) {
  return {
    // What Ergo refused before is told no more once the act is tried again.
    onDelete: (id: string) => {
      dismissed(room);
      return link.current?.redact(room, id) ?? false;
    },
    onDismiss: () => {
      dismissed(room);
    },
    onRead: (id: string) => {
      link.current?.read(room, id);
    },
    // Tagged +reply with the msgid it answers, or +gnoworld/edit with the one it corrects, when it does.
    onSay: (composed: Composed, tags?: { reply?: string; edit?: string }) =>
      (tags?.edit === undefined
        ? link.current?.say(room, composed, tags?.reply)
        : link.current?.correct(room, composed, tags.edit)) ?? false,
    // Why the server's pace keeps a message back, none if it may go.
    slow: (composed: Composed) => link.current?.slow(composed),
    onReact: (reaction: Reacting) => {
      dismissed(room);
      return link.current?.react(room, reaction) ?? false;
    },
    onTyping: (told: "active" | "done") => {
      link.current?.typing(room, told);
    },
  };
}
