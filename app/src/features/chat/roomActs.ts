// What the room in view lets its reader do through the page's link (slice 4's 4c, 4d, 4f), built from the room and the
// link alone: a line, a typist or a place changing the room's state keeps them, and the lines' view its drawing (E2:
// 0.55-0.93 ms a typist's refresh at 200 lines, 0.025-0.044 ms with them kept, /simplify's measure).
import type { Composed, Reacting } from "@gnoworld/core";
import type { RefObject } from "react";
import type { ChatLink } from "./link.ts";

export type RoomActs = ReturnType<typeof roomActs>;

/** Whether the link sends a message of several lines whole: yes while there is no link yet (CR7). */
export const multilineOf = (link: RefObject<ChatLink | undefined>): boolean => link.current?.multiline() ?? true;

export function roomActs(link: RefObject<ChatLink | undefined>, room: string, dismissed: (room: string) => void) {
  return {
    onDelete: (id: string) => link.current?.redact(room, id) ?? false,
    onDismiss: () => {
      dismissed(room);
    },
    onRead: (id: string) => {
      link.current?.read(room, id);
    },
    // Tagged +reply with the msgid it answers, when it answers a line (4d).
    onSay: (composed: Composed, reply?: string) => link.current?.say(room, composed, reply) ?? false,
    onReact: (reaction: Reacting) => link.current?.react(room, reaction) ?? false,
    onTyping: (told: "active" | "done") => {
      link.current?.typing(room, told);
    },
  };
}
