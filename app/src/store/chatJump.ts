// A room read around a found message (slice 13, C): a window of history replaces the room's lines, live lines wait (chat.ts holds them
// back while `jump` is set), and `left` ends it.
import { addLines, addReactions, lineOf, reactionOf, type IrcMessage } from "@gnoworld/core";
import type { StateCreator } from "zustand/vanilla";
import { LINES_KEPT, REACTIONS_KEPT, type ChatSlice, type RoomState } from "./chat.ts";
import { own } from "./record.ts";

export interface JumpSlice {
  chatJump: {
    /** The window Ergo gave around a message replaces the room's lines. */
    jumped: (room: string, id: string, messages: readonly IrcMessage[]) => void;
    /** The room is read at its newest again: the window is forgotten, to be asked anew. */
    left: (room: string) => void;
  };
}

// A room as the window of history around the message `jump` shows it.
function windowed(room: RoomState, window: { id: string; jump: string; messages: readonly IrcMessage[] }): RoomState {
  const { id, jump, messages } = window;
  const lines = addLines(
    [],
    messages.flatMap((message) => lineOf(message, id) ?? []),
    LINES_KEPT,
  );
  const reacted = messages.flatMap((message) => reactionOf(message, id) ?? []);
  return { ...room, lines, jump, paged: true, reactions: addReactions(room.reactions ?? [], reacted, REACTIONS_KEPT) };
}

export const jumpSlice: StateCreator<ChatSlice & JumpSlice, [], [], JumpSlice> = (set, get) => {
  const put = (id: string, next: (room: RoomState) => RoomState | undefined) => {
    const { chat } = get();
    const room = own(chat.rooms, id);
    const changed = room === undefined ? undefined : next(room);
    if (changed !== undefined) set({ chat: { ...chat, rooms: { ...chat.rooms, [id]: changed } } });
  };
  return {
    chatJump: {
      jumped: (id, jump, messages) => {
        put(id, (room) => windowed(room, { id, jump, messages }));
      },
      left: (id) => {
        put(id, (room) => (room.jump === undefined ? undefined : { ...room, lines: [], jump: undefined }));
      },
    },
  };
};
