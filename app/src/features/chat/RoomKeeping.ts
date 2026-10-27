// What the room in view shows and lets an account do of what it keeps and of the room's pins (slice 4's 4d): its
// saved lines and the place it asked to go back to, from the device, the room's pins, from the server, and the acts
// that change them, built from the store and the shown room alone.
import type { Line } from "@gnoworld/core";
import type { PinnedLine } from "@gnoworld/schemas";
import { own } from "../../store/record.ts";
import { useApp, useAppStore } from "../../storeContext.tsx";
import type { Done } from "./askPins.ts";
import type { Pinning } from "./usePins.ts";

/** What a room's lines show and offer of what the reader keeps, by the id of each line. */
export interface RoomKeeping {
  /** The reading place the reader asked to go back to in this room, kept on the device; none if none. */
  unread: string | undefined;
  /** The lines saved on this device, and those pinned in the room. */
  saved: ReadonlySet<string>;
  pinned: ReadonlySet<string>;
  onSave: (id: string) => "saved" | "full" | "none" | undefined;
  onUnsave: (id: string) => void;
  onMarkUnread: (id: string) => void;
  /** The reader read to the end of the room: its place on the device is forgotten. */
  onReadThrough: () => void;
  /** Pin and unpin, for a reader who may pin in the room. */
  pin?: Pinning | undefined;
}

/** The room's pins as the bar above its lines shows them. */
export interface RoomPins {
  list: readonly PinnedLine[];
  may: boolean;
  onUnpin: (id: string) => Promise<Done>;
}

/** The shown room's keeping and pins: none for no room, a direct message's, which has neither. */
export function useRoomKeeping(room: string | undefined, pinning: Pinning) {
  const store = useAppStore();
  const saved = useApp(({ keep }) => keep.saved);
  const unread = useApp(({ keep }) => (room === undefined ? undefined : own(keep.unread, room)));
  const held = useApp(({ pins }) => (room === undefined ? undefined : own(pins, room)));
  if (room === undefined) return { keeping: undefined, pins: undefined };
  const lineOf = (id: string): Line | undefined =>
    store.getState().chat.rooms[room]?.lines.findLast((line) => line.id === id);
  const { keepActions } = store.getState();
  const keeping: RoomKeeping = {
    unread,
    saved: new Set(saved.filter((line) => line.room === room).map(({ id }) => id)),
    pinned: new Set(held?.pins.map(({ id }) => id)),
    onSave: (id) => {
      const line = lineOf(id);
      return line === undefined ? "none" : keepActions.save(room, line);
    },
    onUnsave: (id) => {
      keepActions.unsave(room, id);
    },
    onMarkUnread: (id) => {
      const line = lineOf(id);
      if (line !== undefined) keepActions.markUnread(room, line);
    },
    onReadThrough: () => {
      keepActions.readThrough(room);
    },
    pin: held?.may === true ? pinning : undefined,
  };
  return {
    keeping,
    pins:
      held === undefined || held.pins.length === 0
        ? undefined
        : { list: held.pins, may: held.may, onUnpin: pinning.unpin },
  };
}
