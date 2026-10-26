// The verdicts' slice of the store (slice 4's 4g): each line's verdict from the server's stream, by room and msgid,
// which a link's player waits on. A slice of its own, beside the chat's: the stream is another source than Ergo.
import type { StreamEvent } from "@gnoworld/schemas";
import type { StateCreator } from "zustand/vanilla";
import { LINES_KEPT } from "./chat.ts";

/** A room's newest verdicts kept, its window's lines twice over, so a long session holds no more. */
export const VERDICTS_KEPT = 2 * LINES_KEPT;

type Verdicts = Readonly<Record<string, StreamEvent["state"]>>;

export interface VerdictsSlice {
  /** Each room's verdicts, by msgid, oldest first. */
  verdicts: Readonly<Record<string, Verdicts>>;
  verdictActions: {
    /** A verdict from the stream, over an earlier one of the same line. */
    judged: (event: StreamEvent) => void;
  };
}

export const verdictsSlice: StateCreator<VerdictsSlice> = (set, get) => ({
  verdicts: {},
  verdictActions: {
    judged: ({ msgid, room, state }) => {
      const { verdicts } = get();
      const held = Object.hasOwn(verdicts, room) ? verdicts[room] : undefined;
      if (held?.[msgid] === state) return;
      const entries = Object.entries({ ...held, [msgid]: state });
      set({ verdicts: { ...verdicts, [room]: Object.fromEntries(entries.slice(-VERDICTS_KEPT)) } });
    },
  },
});
