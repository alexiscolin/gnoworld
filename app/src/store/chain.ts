// The chain's slice of the store (slice 9g): what the stream told of the chain, and nothing else (ADR-0002 §4: nothing is
// optimistic, a room shows "kaito voted yes" only from the chain's event). A world's calls, the deploys the ticker shows, and
// each universe's count of realms deployed in 24 h, each with its block height. Every part is bounded, and a batch of events is one set.
import type { ChainEvent, RealmsDeployed } from "@gnoworld/schemas";
import type { StateCreator } from "zustand/vanilla";

export type ChainCall = Extract<ChainEvent, { kind: "call" }>;
export type ChainDeploy = Extract<ChainEvent, { kind: "deploy" }>;
/** A call as the page heard it: with the time of its hearing, which places it among a room's messages (a chain event has no time). */
type ChainHeard = ChainCall & { at: string };

/** The most a world keeps, the most the ticker keeps, and the worlds kept: a session holds no more than it shows. */
const LINES = 50;
const DEPLOYS = 20;
const WORLDS = 200;

export interface ChainSlice {
  chainByWorld: Readonly<Record<string, readonly ChainHeard[]>>;
  deploys: readonly ChainDeploy[];
  realmsDeployed: Readonly<Record<string, RealmsDeployed>>;
  chainActions: {
    /** Events from the stream, in order, in one update. */
    heard: (events: readonly ChainEvent[]) => void;
    /** A universe's count, unless one at a later block is held. */
    counted: (count: RealmsDeployed) => void;
  };
}

export const chainSlice: StateCreator<ChainSlice> = (set, get) => ({
  chainByWorld: {},
  deploys: [],
  realmsDeployed: {},
  chainActions: {
    heard: (events) => {
      const { chainByWorld, deploys } = get();
      let byWorld = chainByWorld;
      const at = new Date().toISOString();
      for (const call of events) {
        if (call.kind !== "call") continue;
        const held = byWorld[call.world];
        if (held !== undefined || Object.keys(byWorld).length < WORLDS)
          byWorld = { ...byWorld, [call.world]: [...(held ?? []), { ...call, at }].slice(-LINES) };
      }
      const added = events.filter((event) => event.kind === "deploy");
      set({ chainByWorld: byWorld, deploys: added.length === 0 ? deploys : [...deploys, ...added].slice(-DEPLOYS) });
    },
    counted: (count) => {
      const held = get().realmsDeployed[count.universe];
      if (held === undefined || count.height >= held.height)
        set({ realmsDeployed: { ...get().realmsDeployed, [count.universe]: count } });
    },
  },
});
