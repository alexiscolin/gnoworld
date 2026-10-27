// What the room in view lets its reader do through the page's link (slice 4's 4c, 4d, 4f), built from the room and the
// link alone: a line, a typist or a place changing the room's state keeps them, and the lines' view its drawing (E2:
// 0.55-0.93 ms a typist's refresh at 200 lines, 0.025-0.044 ms with them kept, /simplify's measure).
import type { Reacting } from "@gnoworld/core";
import type { RefObject } from "react";
import type { ChatLink } from "./link.ts";

export type RoomActs = ReturnType<typeof roomActs>;

export function roomActs(link: RefObject<ChatLink | undefined>, room: string, dismissed: (room: string) => void) {
  return {
    // What Ergo refused before is told no more once the act is tried again (CR4).
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
    // Tagged +reply with the msgid it answers (4d), or +gnoworld/edit with the one it corrects, when it does.
    onSay: (draft: string, tags?: { reply?: string; edit?: string }) =>
      (tags?.edit === undefined
        ? link.current?.say(room, draft, tags?.reply)
        : link.current?.correct(room, draft, tags.edit)) ?? false,
    onReact: (reaction: Reacting) => {
      dismissed(room);
      return link.current?.react(room, reaction) ?? false;
    },
    onTyping: (told: "active" | "done") => {
      link.current?.typing(room, told);
    },
  };
}
