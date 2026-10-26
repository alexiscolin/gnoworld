// The chat's slice of the store (slice 4's merge 4b): the rooms the page follows, each with its newest lines
// (its window), who is here and its description, and my nick on Ergo while connected. Ergo's lines change it
// through core/chat's rules; each action sets the state only when something changed, so a subscriber hears a
// change once and nothing else.
import {
  addLines,
  concerns,
  lineOf,
  membersAfter,
  redactAfter,
  refusedOf,
  topicAfter,
  typingAfter,
  readAfter,
  type IrcMessage,
  type Line,
  type Typing,
  type Where,
} from "@gnoworld/core";
import type { StateCreator } from "zustand/vanilla";

/** The lines a room keeps: its history's window (docs/plans/slice-4.md, §4). */
export const LINES_KEPT = 200;

interface RoomState {
  readonly lines: readonly Line[];
  /** Who is here, by nick: an account's nick is its address; a guest's is its own. */
  readonly members: readonly string[];
  /** The room's description, its IRC topic. */
  readonly topic: string | undefined;
  /** The msgid of a line Ergo refused to delete, until the page has said so (4c's message menu). */
  readonly refused: string | undefined;
  /** Who is typing, each nick with the time its typing ends on the page's clock (4f); none while nobody is. */
  readonly typing: Typing;
  /** The time of the last line the account read here, as Ergo keeps it for the account (4f); none while unknown. */
  readonly read: string | undefined;
  /** This connection's history page came, an empty one too: the New mark and the read mark wait on it (4f's G1,
   * CR3); none before, and none again once the link drops. */
  readonly paged?: true | undefined;
}

interface ChatState {
  /** My nick on Ergo, while connected. */
  me: string | undefined;
  /** The rooms followed, by id, in the order given. */
  rooms: Readonly<Record<string, RoomState>>;
}

export interface ChatSlice {
  chat: ChatState;
  chatActions: {
    /** The rooms to follow: the ones kept keep what they hold, the new ones start empty, the others go. */
    follow: (rooms: readonly string[]) => void;
    connected: (me: string) => void;
    /** One live line from Ergo, read by every room it concerns. */
    heard: (message: IrcMessage) => void;
    /** A history page of a room: its lines added at once; its replayed events change nothing. */
    page: (room: string, messages: readonly IrcMessage[]) => void;
    /** The link gone: my nick and who is here forgotten; the lines and topics kept to show meanwhile. */
    disconnected: () => void;
    /** The page said a room's refused delete: it is forgotten. */
    dismissed: (room: string) => void;
  };
}

const EMPTY: RoomState = {
  lines: [],
  members: [],
  topic: undefined,
  refused: undefined,
  typing: undefined,
  read: undefined,
};

// A room once a live line is read at `now`, the page's clock: the same object when the line changes nothing of it.
function roomAfter(room: RoomState, message: IrcMessage, at: Where & { now: number }): RoomState {
  const line = lineOf(message, at.room);
  const added = line === undefined ? room.lines : addLines(room.lines, [line], LINES_KEPT);
  const next = {
    lines: redactAfter(added, message, at.room),
    members: membersAfter(room.members, message, at),
    topic: topicAfter(room.topic, message, at.room),
    typing: typingAfter(room.typing, message, at),
    read: readAfter(room.read, message, at),
  };
  const same = (Object.keys(next) as (keyof typeof next)[]).every((key) => next[key] === room[key]);
  return same ? room : { ...room, ...next };
}

// A room followed, by its id: an own key alone, the ids being the relay's.
const roomOf = (rooms: ChatState["rooms"], id: string): RoomState | undefined =>
  Object.hasOwn(rooms, id) ? rooms[id] : undefined;

// Each room changed by `change`, or the same record when none was.
function eachRoom(rooms: ChatState["rooms"], change: (room: RoomState, id: string) => RoomState): ChatState["rooms"] {
  const next = Object.fromEntries(Object.entries(rooms).map(([id, room]) => [id, change(room, id)]));
  return Object.keys(next).every((id) => next[id] === rooms[id]) ? rooms : next;
}

const sameKeys = (one: readonly string[], other: readonly string[]): boolean =>
  one.length === other.length && one.every((key, index) => key === other[index]);

export const chatSlice: StateCreator<ChatSlice> = (set, get) => {
  const change = (next: Partial<ChatState>) => {
    const chat = get().chat;
    const keys = Object.keys(next) as (keyof ChatState)[];
    if (keys.every((key) => Object.is(chat[key], next[key]))) return;
    set({ chat: { ...chat, ...next } });
  };
  return {
    chat: { me: undefined, rooms: {} },
    chatActions: {
      follow: (ids) => {
        const { rooms } = get().chat;
        const wanted = [...new Set(ids)];
        if (sameKeys(Object.keys(rooms), wanted)) return;
        change({ rooms: Object.fromEntries(wanted.map((id) => [id, roomOf(rooms, id) ?? EMPTY])) });
      },
      connected: (me) => {
        change({ me });
      },
      // A line goes to the room it names; a QUIT or a NICK to every room.
      heard: (message) => {
        const { me = "", rooms } = get().chat;
        // Ergo's refusal of a delete names its room and line at its own places (FAIL REDACT).
        const refusal = refusedOf(message);
        const refusing = refusal === undefined ? undefined : roomOf(rooms, refusal.room);
        if (refusal !== undefined && refusing !== undefined) {
          change({ rooms: { ...rooms, [refusal.room]: { ...refusing, refused: refusal.id } } });
          return;
        }
        const id = concerns(message);
        // ponytail: a QUIT or a NICK reads every room's people, 100 rooms of M each, though Ergo sends it for the
        // rooms shared alone (1,000 QUITs at 100 rooms of 2,500: 155 ms, the complexity-reviewer); a nick's rooms
        // indexed in the store is the next step.
        const now = Date.now();
        if (id === "*") {
          change({ rooms: eachRoom(rooms, (room, each) => roomAfter(room, message, { room: each, me, now })) });
          return;
        }
        const room = id === undefined ? undefined : roomOf(rooms, id);
        if (id === undefined || room === undefined) return;
        const next = roomAfter(room, message, { room: id, me, now });
        if (next !== room) change({ rooms: { ...rooms, [id]: next } });
      },
      page: (id, messages) => {
        const { rooms } = get().chat;
        const room = roomOf(rooms, id);
        if (room === undefined) return;
        const read = messages.flatMap((message) => lineOf(message, id) ?? []);
        const lines = addLines(room.lines, read, LINES_KEPT);
        if (lines !== room.lines || room.paged !== true)
          change({ rooms: { ...rooms, [id]: { ...room, lines, paged: true } } });
      },
      dismissed: (id) => {
        const { rooms } = get().chat;
        const room = roomOf(rooms, id);
        if (room?.refused !== undefined) change({ rooms: { ...rooms, [id]: { ...room, refused: undefined } } });
      },
      // Who is here, who is typing and the history page go with the link; the reading place is the account's, kept.
      disconnected: () => {
        const { rooms } = get().chat;
        const gone = (room: RoomState) =>
          room.members.length === 0 && room.typing === undefined && room.paged === undefined;
        change({
          me: undefined,
          rooms: eachRoom(rooms, (room) =>
            gone(room) ? room : { ...room, members: [], typing: undefined, paged: undefined },
          ),
        });
      },
    },
  };
};
