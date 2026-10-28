// The room's pins as a reader sees them (slice 4's 4d): the lines pinned, each under the id it is shown by, and the bar
// above the lines. A visitor reads them as an account does; what an account keeps besides is RoomKeeping's.
import { foldEdits, type Line } from "@gnoworld/core";
import type { PinnedLine } from "@gnoworld/schemas";
import { own } from "../../store/record.ts";
import { useApp } from "../../storeContext.tsx";
import type { Done } from "./askPins.ts";
import type { RoomKeeping } from "./RoomKeeping.ts";
import type { Pinning } from "./usePins.ts";

/** The room's pins as the bar above its lines shows them. */
export interface RoomPins {
  list: readonly PinnedLine[];
  may: boolean;
  onUnpin: (id: string) => Promise<Done>;
}

/** A room's pins as the server answered, and the lines the room shows: the pins' shown ids and the bar above the lines;
 * a pin of an edit is shown on the line it corrects, which the first version's id names. */
export function pinsOf(
  held: { pins: readonly PinnedLine[]; may: boolean } | undefined,
  lines: readonly Line[] | undefined,
  pinning: Pinning,
) {
  const pinsHeld = held?.pins ?? [];
  const folded = pinsHeld.length === 0 ? undefined : foldEdits(lines ?? []).folded;
  const shownIdOf = (id: string): string => folded?.get(id) ?? id;
  return {
    pinsHeld,
    shownIdOf,
    pinned: new Set(pinsHeld.map(({ id }) => shownIdOf(id))),
    bar:
      held === undefined || held.pins.length === 0
        ? undefined
        : { list: held.pins, may: held.may, onUnpin: pinning.unpin },
  };
}

/** The room's pins as the store holds them, and its lines, which fold an edit into the line it corrects. */
export function useRoomPins(room: string | undefined) {
  const held = useApp(({ pins }) => (room === undefined ? undefined : own(pins, room)));
  const lines = useApp(({ chat }) => (room === undefined ? undefined : own(chat.rooms, room)?.lines));
  return { held, lines };
}

/** What a visitor's room shows of its pins: the lines marked, the bar. It saves nothing and marks nothing unread: it
 * has no device to keep them on, and its line's bar offers neither. */
export function useGuestKeeping(room: string | undefined, pinning: Pinning) {
  const { held, lines } = useRoomPins(room);
  if (room === undefined) return { keeping: undefined, pins: undefined };
  const { pinned, bar } = pinsOf(held, lines, pinning);
  const none = () => undefined;
  const keeping: RoomKeeping = {
    unread: undefined,
    saved: new Set(),
    pinned,
    onSave: () => "none",
    onUnsave: none,
    onMarkUnread: none,
    onReadThrough: none,
  };
  return { keeping, pins: bar };
}
