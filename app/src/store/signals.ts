// The signals' slice of the store (slice 9h): `arrivals` are the stream's signals, which a banner shows to the account
// that earned it; `firsts` are what a world's plate says, from the stream or from the server's answer to a read. A read never
// makes an arrival: a banner is shown from the server's signal alone, never from a page load. A world is kept once, its first
// of each kind: a later one changes nothing, and a stale read never takes a first away.
import type { Signal, WorldFirsts } from "@gnoworld/schemas";
import type { StateCreator } from "zustand/vanilla";
import { lastKept, own } from "./record.ts";

/** The worlds held at most: a session visits few, and the stream names any world a reader follows. */
const SIGNAL_WORLDS = 100;

type First = NonNullable<WorldFirsts["charted"]>;
type Arrival = Partial<Record<Signal["kind"], Signal>>;
interface Firsts {
  charted: First | null;
  words: First | null;
}
const NONE: Firsts = { charted: null, words: null };
const SLOT = { chart: "charted", words: "words" } as const;

export interface SignalsSlice {
  signals: {
    /** Each world's signals as the stream told them, its first of each kind. */
    arrivals: Readonly<Record<string, Arrival>>;
    /** Who is first in each world, as the plate says it. */
    firsts: Readonly<Record<string, Firsts>>;
  };
  signalActions: {
    /** A signal from the stream: the world's arrival, and its first, unless one is held. */
    signaled: (signal: Signal) => void;
    /** The server's answer to a read: the plate's firsts, never an arrival, and never over one held. */
    firstsRead: (firsts: WorldFirsts) => void;
    /** A new session: no arrival stays, a banner being the account's that earned it; the firsts are public and stay. */
    forget: () => void;
  };
}

export const signalsSlice: StateCreator<SignalsSlice> = (set, get) => ({
  signals: { arrivals: {}, firsts: {} },
  signalActions: {
    signaled: (signal) => {
      const { kind, world, account, at } = signal;
      const { arrivals, firsts } = get().signals;
      const arrival = own(arrivals, world) ?? {};
      const held = own(firsts, world) ?? NONE;
      const slot = SLOT[kind];
      const newArrival = arrival[kind] === undefined;
      const newFirst = held[slot] === null;
      if (!newArrival && !newFirst) return;
      set({
        signals: {
          arrivals: newArrival ? lastKept(arrivals, [world, { ...arrival, [kind]: signal }], SIGNAL_WORLDS) : arrivals,
          firsts: newFirst ? lastKept(firsts, [world, { ...held, [slot]: { account, at } }], SIGNAL_WORLDS) : firsts,
        },
      });
    },
    firstsRead: ({ world, charted, words }) => {
      const { arrivals, firsts } = get().signals;
      const held = own(firsts, world) ?? NONE;
      const next = { charted: held.charted ?? charted, words: held.words ?? words };
      if (next.charted === held.charted && next.words === held.words) return;
      set({ signals: { arrivals, firsts: lastKept(firsts, [world, next], SIGNAL_WORLDS) } });
    },
    forget: () => {
      const { arrivals, firsts } = get().signals;
      if (Object.keys(arrivals).length > 0) set({ signals: { arrivals: {}, firsts } });
    },
  },
});
