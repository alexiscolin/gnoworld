// The signals' slice of the store (slice 9h): the stream's first signals, each world's first of each kind, in the order heard.
// A banner shows one only to the account it names, and the plate names anyone's (features/world/Banners.tsx). Kept small: it
// is on every world's first screen (budgets.spec.ts).
import type { Signal } from "@gnoworld/schemas";
import type { StateCreator } from "zustand/vanilla";

/** The signals held at most: a session visits few worlds, and a world has two firsts. */
const KEPT = 200;

export interface SignalsSlice {
  signals: readonly Signal[];
  signalActions: {
    /** A signal from the stream, unless its world's first of its kind is held: a later one changes nothing. */
    signaled: (signal: Signal) => void;
  };
}

export const signalsSlice: StateCreator<SignalsSlice> = (set, get) => ({
  signals: [],
  signalActions: {
    signaled: (signal) => {
      const held = get().signals;
      if (!held.some(({ world, kind }) => world === signal.world && kind === signal.kind))
        set({ signals: [...held, signal].slice(-KEPT) });
    },
  },
});
