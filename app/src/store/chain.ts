// The chain's slice of the store (slice 9g): what the stream told of the chain, and nothing else (ADR-0002 §4: nothing is
// optimistic, a room shows "kaito voted yes" only from the chain's event). A world's calls, each with its block height. Every part is
// bounded, and a batch of events is one set.
import type { ChainEvent } from "@gnoworld/schemas";
import type { StateCreator } from "zustand/vanilla";

export type ChainCall = Extract<ChainEvent, { kind: "call" }>;
/** A call as the page heard it: with the time of its hearing, which places it among a room's messages (a chain event has no time). */
export type ChainHeard = ChainCall & { at: string };

/** The most a world keeps, and the worlds kept: a session holds no more than it shows. */
const LINES = 50;
const WORLDS = 200;

/** The key a world's lines are kept under. */
export const chainKey = (universe: string, world: string): string => `${universe}/${world}`;

export interface ChainSlice {
  chainByWorld: Readonly<Record<string, readonly ChainHeard[]>>;
  chainActions: {
    /** Events from the stream, in order, in one update. */
    heard: (events: readonly ChainEvent[]) => void;
  };
}

export const chainSlice: StateCreator<ChainSlice> = (set, get) => ({
  chainByWorld: {},
  chainActions: {
    heard: (events) => {
      const { chainByWorld } = get();
      let byWorld = chainByWorld;
      const at = new Date().toISOString();
      for (const call of events) {
        if (call.kind !== "call") continue;
        const key = chainKey(call.universe, call.world);
        const held = byWorld[key];
        if (held?.some(({ id }) => id === call.id) === true) continue;
        if (held !== undefined || Object.keys(byWorld).length < WORLDS)
          byWorld = { ...byWorld, [key]: [...(held ?? []), { ...call, at }].slice(-LINES) };
      }
      if (byWorld !== chainByWorld) set({ chainByWorld: byWorld });
    },
  },
});
