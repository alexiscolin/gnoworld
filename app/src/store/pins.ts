// The pins' slice of the store (slice 4's 4d): each room's pins and whether the reader may pin there, as the server
// answers (GET /api/pins). A slice of its own, beside the verdicts': they come from the server, not from Ergo's lines.
import type { IrcMessage } from "@gnoworld/core";
import { RoomId, type PinList } from "@gnoworld/schemas";
import type { StateCreator } from "zustand/vanilla";
import { lastKept, own } from "./record.ts";

/** The rooms whose pins are held at most: a session joins 100 (Ergo's max-channels-per-client). */
export const PINS_ROOMS = 100;
// The lines taken from a room, as many as are remembered: an answer asked before a REDACT and given after it must not
// bring its pin back.
const GONE_KEPT = 500;

type Held = Readonly<Record<string, Pick<PinList, "may" | "pins">>>;

export interface PinsSlice {
  /** Each room's pins and the reader's right to pin there, the room answered longest ago first. */
  pins: Held;
  pinsActions: {
    /** A room's answer: held as it is, the room put last; the same answer again changes nothing. */
    set: (list: PinList) => void;
    /** A new session: every room's forgotten, the right to pin being its reader's own. */
    forget: () => void;
    /** A line taken from a room (Ergo's REDACT): its pin goes, and no answer brings it back. */
    redacted: (room: string, id: string) => void;
    /** One live line from Ergo: a REDACT is a line taken from its room; any other changes nothing. */
    heard: (message: IrcMessage) => void;
  };
}

const same = (a: Held[string] | undefined, b: Held[string]): boolean =>
  a?.may === b.may &&
  a.pins.length === b.pins.length &&
  a.pins.every((pin, at) => JSON.stringify(pin) === JSON.stringify(b.pins[at]));

export const pinsSlice: StateCreator<PinsSlice> = (set, get) => {
  // The ids taken from rooms, the oldest forgotten first.
  const gone = new Set<string>();
  const redacted = (room: string, id: string): void => {
    gone.add(`${room} ${id}`);
    // A Set walks in insertion order: the first is the oldest, and at most one is past the bound.
    for (const old of gone) {
      if (gone.size <= GONE_KEPT) break;
      gone.delete(old);
    }
    const { pins } = get();
    const held = own(pins, room);
    if (held?.pins.some((pin) => pin.id === id) !== true) return;
    set({ pins: { ...pins, [room]: { ...held, pins: held.pins.filter((pin) => pin.id !== id) } } });
  };
  return {
    pins: {},
    pinsActions: {
      set: (list) => {
        if (!RoomId.safeParse(list.room).success) return;
        const next = { may: list.may, pins: list.pins.filter(({ id }) => !gone.has(`${list.room} ${id}`)) };
        const { pins } = get();
        if (same(pins[list.room], next)) return;
        set({ pins: lastKept(pins, [list.room, next], PINS_ROOMS) });
      },
      forget: () => {
        if (Object.keys(get().pins).length > 0) set({ pins: {} });
      },
      redacted,
      heard: ({ command, params: [room = "", id = ""] }) => {
        if (command === "REDACT" && id !== "") redacted(room, id);
      },
    },
  };
};
