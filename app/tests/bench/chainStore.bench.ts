// The chain events' budget (docs/plans/slice-9.md §4): 1,000 events a minute into 100 rooms keeps the store's update under 2 ms a
// batch with the CPU slowed 4×; the stream's coalescing sends 4 events a second a room, so a batch is a second's worth, at
// most 17 here (1,000 a minute) and 400 at the cap. Measured on this machine's CPU as it runs, so the budget is a
// quarter of the plan's: 0.5 ms here is 2 ms slowed 4×. Measured by scripts/bench.py in the full gate.
import type { ChainEvent } from "@gnoworld/schemas";
import { Address } from "@gnoworld/schemas";
import { bench, describe } from "vitest";
import { createAppStore } from "../../src/store/index.ts";

const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const event = (height: number): ChainEvent => ({
  id: `h${String(height)}:0`,
  kind: "call",
  universe: "onyx",
  world: `w${String(height % 100)}`,
  realm: "gno.land/r/gov/dao",
  func: "MustVoteOnProposal",
  actor: ALICE,
  height,
});

// The batches are built before the timing starts: a bench times the store's update, not the making of its input.
const batch = (size: number, from: number): ChainEvent[] => Array.from({ length: size }, (_, n) => event(from + n));
const small = batch(17, 0);
const cap = batch(400, 1000);

describe("the chain's store", () => {
  const store = createAppStore();
  // Every one of the 100 rooms holds its 50 lines before the timing, so each batch replaces lines and grows nothing.
  store.getState().chainActions.heard(batch(5000, 10_000));
  bench("a batch of 17 events across 100 rooms, the rooms full [0.5 ms]", () => {
    store.getState().chainActions.heard(small);
    // A bench that heard nothing would time a no-op.
    if (store.getState().chainByWorld["w1"]?.length !== 50) throw new Error("the bench's store holds no full room");
  });
  // The coalescer's worst case, 100 rooms at their 4 a second: 400 events in one second's batch (docs/plans/slice-9.md §4).
  bench("a batch of 400 events across 100 rooms, the rooms full [8 ms]", () => {
    store.getState().chainActions.heard(cap);
    if (store.getState().chainByWorld["w1"]?.length !== 50) throw new Error("the bench's store holds no full room");
  });
});
