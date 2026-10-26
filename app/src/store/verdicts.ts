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
    /** A verdict from the stream, over an earlier one of the same line. */
    judged: (event: StreamEvent) => void;
  };
}

export const verdictsSlice: StateCreator<VerdictsSlice> = (set, get) => ({
  verdicts: {},
  verdictsOrder: {},
  verdictActions: {
    judged: ({ msgid, room, state }) => {
      const { verdicts, verdictsOrder } = get();
      const held = Object.hasOwn(verdicts, room) ? verdicts[room] : undefined;
      if (held?.[msgid] === state) return;
      const order = (Object.hasOwn(verdictsOrder, room) ? verdictsOrder[room] : undefined) ?? [];
      const known = held !== undefined && Object.hasOwn(held, msgid);
      const all = known ? order : [...order, msgid];
      const gone = new Set(all.slice(0, -VERDICTS_KEPT));
      const kept = Object.entries({ ...held, [msgid]: state }).filter(([id]) => !gone.has(id));
      set({
        verdicts: { ...verdicts, [room]: Object.fromEntries(kept) },
        verdictsOrder: { ...verdictsOrder, [room]: all.slice(-VERDICTS_KEPT) },
      });
    },
  },
});
