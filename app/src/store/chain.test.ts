import { Address, type ChainEvent } from "@gnoworld/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppStore } from "./index.ts";

// Slice 9g: the chain's slice, from the stream's events alone (ADR-0002 §4: nothing is optimistic). A room's line exists only
// once its chain event has come; each is kept with its height; what a room keeps is bounded.
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const call = (height: number, world = "govdao"): ChainEvent => ({
  kind: "call",
  universe: "onyx",
  world,
  realm: "gno.land/r/gov/dao",
  func: "MustVoteOnProposal",
  actor: ALICE,
  height,
});
const deploy = (height: number): ChainEvent => ({
  kind: "deploy",
  universe: "onyx",
  realm: `gno.land/r/${ALICE}/r${String(height)}`,
  actor: ALICE,
  height,
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the chain's slice", () => {
  it("starts with no line in any room, no deploy for the ticker and no count: nothing is shown before its chain event", () => {
    const state = createAppStore().getState();
    expect(state.chainByWorld).toEqual({});
    expect(state.deploys).toEqual([]);
    expect(state.realmsDeployed).toEqual({});
  });

  it("keeps a world's calls under that world, oldest first, each with its height", () => {
    const store = createAppStore();
    store.getState().chainActions.heard([call(900030), call(900031, "bubble"), call(900032)]);
    expect(store.getState().chainByWorld["govdao"]?.map(({ height }) => height)).toEqual([900030, 900032]);
    expect(store.getState().chainByWorld["bubble"]?.map(({ height }) => height)).toEqual([900031]);
  });

  it("stamps each call with the time the page heard it, which places it among the room's messages (the event has none)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T09:00:00.000Z"));
    const store = createAppStore();
    store.getState().chainActions.heard([call(1)]);
    vi.setSystemTime(new Date("2026-11-06T09:00:05.000Z"));
    store.getState().chainActions.heard([call(2), call(3)]);
    expect(store.getState().chainByWorld["govdao"]?.map(({ height, at }) => [height, at])).toEqual([
      [1, "2026-11-06T09:00:00.000Z"],
      [2, "2026-11-06T09:00:05.000Z"],
      [3, "2026-11-06T09:00:05.000Z"],
    ]);
  });

  it("keeps the last 50 lines of a world and the last 20 deploys, the oldest out", () => {
    const store = createAppStore();
    store.getState().chainActions.heard(Array.from({ length: 70 }, (_, n) => call(n)));
    store.getState().chainActions.heard(Array.from({ length: 30 }, (_, n) => deploy(1000 + n)));
    expect(store.getState().chainByWorld["govdao"]).toHaveLength(50);
    expect(store.getState().chainByWorld["govdao"]?.[0]?.height).toBe(20);
    expect(store.getState().deploys).toHaveLength(20);
    expect(store.getState().deploys[0]?.height).toBe(1010);
  });

  it("holds a deploy for the ticker and none in a world's lines, and a call in a world's lines and not the ticker", () => {
    const store = createAppStore();
    store.getState().chainActions.heard([deploy(5), call(6)]);
    expect(store.getState().deploys.map(({ height }) => height)).toEqual([5]);
    expect(
      Object.values(store.getState().chainByWorld)
        .flat()
        .map(({ height }) => height),
    ).toEqual([6]);
  });

  it("holds 200 worlds at most: a world past them is not kept", () => {
    const store = createAppStore();
    store.getState().chainActions.heard(Array.from({ length: 201 }, (_, n) => call(n, `w${String(n)}`)));
    expect(Object.keys(store.getState().chainByWorld)).toHaveLength(200);
  });

  it("keeps taking the lines of a world it holds once 200 worlds are held, and keeps no new one", () => {
    const store = createAppStore();
    store.getState().chainActions.heard(Array.from({ length: 200 }, (_, n) => call(n, `w${String(n)}`)));
    store.getState().chainActions.heard([call(900, "w0"), call(901, "w200")]);
    expect(Object.keys(store.getState().chainByWorld)).toHaveLength(200);
    expect(store.getState().chainByWorld["w0"]?.map(({ height }) => height)).toEqual([0, 900]);
    expect(store.getState().chainByWorld["w200"]).toBeUndefined();
  });

  it("keeps a universe's count with its height, and a count at an older height does not replace a newer one", () => {
    const store = createAppStore();
    store.getState().chainActions.counted({ universe: "onyx", count: 17, height: 908297 });
    store.getState().chainActions.counted({ universe: "onyx", count: 16, height: 908290 });
    expect(store.getState().realmsDeployed["onyx"]).toEqual({ universe: "onyx", count: 17, height: 908297 });
    store.getState().chainActions.counted({ universe: "onyx", count: 18, height: 908300 });
    expect(store.getState().realmsDeployed["onyx"]?.count).toBe(18);
  });

  it("updates in one set for a batch: a subscriber is told once", () => {
    const store = createAppStore();
    let told = 0;
    store.subscribe(() => {
      told += 1;
    });
    store.getState().chainActions.heard(Array.from({ length: 17 }, (_, n) => call(n)));
    expect(told).toBe(1);
  });
});
