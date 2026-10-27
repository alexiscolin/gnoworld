// The verdicts' slice of the store (slice 4's 4g): each line's verdict from the server's stream, by room and msgid,
// which a link's player waits on. A slice of its own, beside the chat's: the stream is another source than Ergo.
import type { StreamEvent } from "@gnoworld/schemas";
import type { StateCreator } from "zustand/vanilla";
import { LINES_KEPT } from "./chat.ts";

/** A room's newest verdicts kept, its window's lines twice over, so a long session holds no more. */
export const VERDICTS_KEPT = 2 * LINES_KEPT;

type Verdicts = Readonly<Record<string, StreamEvent["state"]>>;

export interface VerdictsSlice {
  /** Each room's verdicts, by msgid. */
  verdicts: Readonly<Record<string, Verdicts>>;
  /** Each room's msgids with a verdict, oldest first: an object puts a key of digits before the others (F880). */
  verdictsOrder: Readonly<Record<string, readonly string[]>>;
  verdictActions: {
    /** A verdict from the stream or the server, over an earlier one of the same line; a hidden line stays hidden. */
    judged: (event: StreamEvent) => void;
    /** Verdicts the server gave in one answer, taken in one update (F1057). */
    judgedAll: (events: readonly StreamEvent[]) => void;
  };
}

// Own entries alone: a msgid or a room may be any word, `__proto__` among them.
const own = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

// A room's verdicts and their order, copied once for the verdicts an update takes.
interface Taken {
  held: Map<string, StreamEvent["state"]>;
  order: string[];
}

// Takes a verdict into its room's copy, made at its first change: an unchanged verdict, or any after a hide (a
// checked asked of the server before the hide can come after it, F880), changes nothing.
function take(rooms: Map<string, Taken>, { msgid, room, state }: StreamEvent, slice: VerdictsSlice): void {
  const mine = rooms.get(room);
  const now = mine === undefined ? own(own(slice.verdicts, room) ?? {}, msgid) : mine.held.get(msgid);
  if (now === state || now === "hidden") return;
  const copy = mine ?? {
    held: new Map(Object.entries(own(slice.verdicts, room) ?? {})),
    order: [...(own(slice.verdictsOrder, room) ?? [])],
  };
  rooms.set(room, copy);
  if (!copy.held.has(msgid)) copy.order.push(msgid);
  copy.held.set(msgid, state);
}

export const verdictsSlice: StateCreator<VerdictsSlice> = (set, get) => {
  // The rooms an update changes, each trimmed once, and the store set once, or not at all (F1057).
  const judgedAll = (events: readonly StreamEvent[]) => {
    const slice = get();
    const rooms = new Map<string, Taken>();
    for (const event of events) take(rooms, event, slice);
    if (rooms.size === 0) return;
    const verdicts = { ...slice.verdicts };
    const verdictsOrder = { ...slice.verdictsOrder };
    for (const [room, { held, order }] of rooms) {
      for (const id of order.slice(0, -VERDICTS_KEPT)) held.delete(id);
      // As own entries, whatever the room's name.
      const as = { enumerable: true, writable: true, configurable: true };
      Object.defineProperty(verdicts, room, { ...as, value: Object.fromEntries(held) });
      Object.defineProperty(verdictsOrder, room, { ...as, value: order.slice(-VERDICTS_KEPT) });
    }
    set({ verdicts, verdictsOrder });
  };
  return {
    verdicts: {},
    verdictsOrder: {},
    verdictActions: {
      judged: (event) => {
        judgedAll([event]);
      },
      judgedAll,
    },
  };
};
