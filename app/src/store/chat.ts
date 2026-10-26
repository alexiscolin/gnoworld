// The chat's slice of the store (slice 4's merge 4b): the rooms the page follows, each with its newest lines
// (its window), who is here and its description, and my nick on Ergo while connected. Ergo's lines change it
// through core/chat's rules; each action sets the state only when something changed, so a subscriber hears a
// change once and nothing else.
import {
  addLines,
  addReactions,
  concerns,
  lineOf,
  membersAfter,
  reactionOf,
  redactAfter,
  redactReactions,
  refusedOf,
  topicAfter,
  type IrcMessage,
  type Line,
  type Reaction,
  type Where,
} from "@gnoworld/core";
import type { StateCreator } from "zustand/vanilla";

/** The lines a room keeps: its history's window (docs/plans/slice-4.md, §4). */
export const LINES_KEPT = 200;
/** The reactions a room keeps, after one an account, a line and an emoji: five on each line of a window. */
export const REACTIONS_KEPT = 1000;

interface RoomState {
  readonly lines: readonly Line[];
  /** Who is here, by nick: an account's nick is its address; a guest's is its own. */
  readonly members: readonly string[];
  /** The room's description, its IRC topic. */
  readonly topic: string | undefined;
  /** The msgid of a line Ergo refused to delete, until the page has said so (4c's message menu). */
  readonly refused: string | undefined;
  /** The reactions Ergo relayed and replayed (4d), in time order; none until the first. */
  readonly reactions?: readonly Reaction[];
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
    /** A history page of a room: its lines and reactions added at once; its other replayed events change nothing. */
    page: (room: string, messages: readonly IrcMessage[]) => void;
    /** The link gone: my nick and who is here forgotten; the lines and topics kept to show meanwhile. */
    disconnected: () => void;
    /** The page said a room's refused delete: it is forgotten. */
    dismissed: (room: string) => void;
  };
}

const EMPTY: RoomState = { lines: [], members: [], topic: undefined, refused: undefined };

// A room's reactions once a live line is read: the same array, or none, when it changes nothing of them.
function reactionsAfter(held: RoomState["reactions"], message: IrcMessage, room: string): RoomState["reactions"] {
  const reaction = reactionOf(message, room);
  const added = reaction === undefined ? held : addReactions(held ?? [], [reaction], REACTIONS_KEPT);
  return added === undefined ? undefined : redactReactions(added, message, room);
}

// A room once a live line is read: the same object when the line changes nothing of it.
function roomAfter(room: RoomState, message: IrcMessage, at: Where): RoomState {
  const line = lineOf(message, at.room);
  const added = line === undefined ? room.lines : addLines(room.lines, [line], LINES_KEPT);
  const lines = redactAfter(added, message, at.room);
  const members = membersAfter(room.members, message, at);
  const topic = topicAfter(room.topic, message, at.room);
  const reactions = reactionsAfter(room.reactions, message, at.room);
  if (lines === room.lines && members === room.members && topic === room.topic && reactions === room.reactions)
    return room;
  return { ...room, lines, members, topic, ...(reactions === undefined ? {} : { reactions }) };
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
        if (id === "*") {
          change({ rooms: eachRoom(rooms, (room, each) => roomAfter(room, message, { room: each, me })) });
          return;
        }
        const room = id === undefined ? undefined : roomOf(rooms, id);
        if (id === undefined || room === undefined) return;
        const next = roomAfter(room, message, { room: id, me });
        if (next !== room) change({ rooms: { ...rooms, [id]: next } });
      },
      page: (id, messages) => {
        const { rooms } = get().chat;
        const room = roomOf(rooms, id);
        if (room === undefined) return;
        const read = messages.flatMap((message) => lineOf(message, id) ?? []);
        const reacted = messages.flatMap((message) => reactionOf(message, id) ?? []);
        const lines = addLines(room.lines, read, LINES_KEPT);
        const reactions =
          reacted.length === 0 ? room.reactions : addReactions(room.reactions ?? [], reacted, REACTIONS_KEPT);
        if (lines === room.lines && reactions === room.reactions) return;
        change({ rooms: { ...rooms, [id]: { ...room, lines, ...(reactions === undefined ? {} : { reactions }) } } });
      },
      dismissed: (id) => {
        const { rooms } = get().chat;
        const room = roomOf(rooms, id);
        if (room?.refused !== undefined) change({ rooms: { ...rooms, [id]: { ...room, refused: undefined } } });
      },
      disconnected: () => {
        const { rooms } = get().chat;
        change({
          me: undefined,
          rooms: eachRoom(rooms, (room) => (room.members.length === 0 ? room : { ...room, members: [] })),
        });
      },
    },
  };
};
