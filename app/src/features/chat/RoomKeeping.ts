// What the room in view shows and lets an account do of what it keeps and of the room's pins (slice 4's 4d): its
// saved lines and the place it asked to go back to, from the device, the room's pins, from the server, and the acts
// that change them, built from the store and the shown room alone.
import { foldEdits, type Line } from "@gnoworld/core";
import { pageModerationApi } from "../../lib/api/moderation.ts";
import { own } from "../../store/record.ts";
import { useApp, useAppStore } from "../../storeContext.tsx";
import { cardsIn } from "./cardsIn.ts";
import { pinsOf, useRoomPins, type RoomPins } from "./RoomPins.ts";
import type { Done } from "./askPins.ts";
import type { Pinning } from "./usePins.ts";

export type { RoomPins };

/** What a room's lines show and offer of what the reader keeps, by the id of each line. */
export interface RoomKeeping {
  /** The reading place the reader asked to go back to in this room, kept on the device; none if none. */
  unread: string | undefined;
  /** The lines saved on this device, and those pinned in the room. */
  saved: ReadonlySet<string>;
  pinned: ReadonlySet<string>;
  /** The link cards the server told of the room's lines, by msgid (link-previews L4). */
  cards?: Readonly<Record<string, string>> | undefined;
  onSave: (id: string) => "saved" | "full" | "none" | undefined;
  onUnsave: (id: string) => void;
  onMarkUnread: (id: string) => void;
  /** The reader read to the end of the room: its place on the device is forgotten. */
  onReadThrough: () => void;
  /** Pin and unpin, for a reader who may pin in the room. */
  pin?: Pinning | undefined;
  /** Hide a line and mute an account, for the reader whose right is the pin's: the room's moderator or its world's owner. */
  moderate?: { hide: (id: string) => Promise<Done>; mute: (account: string) => Promise<Done> } | undefined;
}

/** The shown room's keeping and pins: none for no room, a direct message's, which has neither. */
export function useRoomKeeping(room: string | undefined, pinning: Pinning) {
  const store = useAppStore();
  const saved = useApp(({ keep }) => keep.saved);
  const unread = useApp(({ keep }) => (room === undefined ? undefined : own(keep.unread, room)));
  const cards = useApp((state) => (room === undefined ? undefined : own(cardsIn(state)?.cards ?? {}, room)));
  const { held, lines } = useRoomPins(room);
  if (room === undefined) return { keeping: undefined, pins: undefined };
  const api = pageModerationApi();
  // What the room shows is the newest version of an edited line (foldEdits), but Ergo keeps each version at its own id:
  // the line saved or marked is the one shown (the first's id, the last edit's words), a pin is the last edit's own id
  // (the first's pin would publish what its author took back, F1483), and a pin is shown on the line it corrects.
  const lineOf = (id: string): Line | undefined =>
    foldEdits(store.getState().chat.rooms[room]?.lines ?? []).shown.findLast((line) => line.id === id);
  const newestOf = (id: string): string => {
    const { folded } = foldEdits(lines ?? []);
    return (lines ?? []).findLast((line) => folded.get(line.id) === id)?.id ?? id;
  };
  const { pinsHeld, shownIdOf, pinned, bar } = pinsOf(held, lines, pinning);
  const { keepActions } = store.getState();
  const keeping: RoomKeeping = {
    unread,
    saved: new Set(saved.filter((line) => line.room === room).map(({ id }) => id)),
    pinned,
    cards,
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
    pin:
      held?.may === true
        ? {
            pin: (id) => pinning.pin(newestOf(id)),
            unpin: (id) => pinning.unpin(pinsHeld.find((pin) => shownIdOf(pin.id) === id)?.id ?? id),
          }
        : undefined,
    moderate:
      held?.may === true
        ? {
            // The line shown and its last edit are two ids at Ergo: both go, in one request.
            hide: (id) => api.hide(room, [...new Set([id, newestOf(id)])]),
            mute: (account) => api.mute(room, account),
          }
        : undefined,
  };
  return { keeping, pins: bar };
}
