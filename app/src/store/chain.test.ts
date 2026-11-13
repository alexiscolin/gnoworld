import { Address, type ChainEvent } from "@gnoworld/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chainKey } from "./chain.ts";
import { createAppStore } from "./index.ts";

// Slice 9g: the chain's slice, from the stream's events alone (ADR-0002 §4: nothing is optimistic). A room's line exists only
// once its chain event has come; each is kept with its height; what a room keeps is bounded.
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const call = (height: number, world = "govdao"): ChainEvent => ({
  id: `h${String(height)}:0`,
  kind: "call",
  universe: "onyx",
  world,
  realm: "gno.land/r/gov/dao",
  func: "MustVoteOnProposal",
  actor: ALICE,
  height,
});
const deploy = (height: number): ChainEvent => ({
  id: `h${String(height)}:0`,
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
  it("starts with no line in any world: nothing is shown before its chain event", () => {
    expect(createAppStore().getState().chainByWorld).toEqual({});
  });

  it("keeps a world's calls under that world, oldest first, each with its height", () => {
    const store = createAppStore();
    store.getState().chainActions.heard([call(900030), call(900031, "bubble"), call(900032)]);
    expect(store.getState().chainByWorld[chainKey("onyx", "govdao")]?.map(({ height }) => height)).toEqual([
      900030, 900032,
    ]);
    expect(store.getState().chainByWorld[chainKey("onyx", "bubble")]?.map(({ height }) => height)).toEqual([900031]);
  });

  it("stamps each call with the time the page heard it, which places it among the room's messages (the event has none)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T09:00:00.000Z"));
    const store = createAppStore();
    store.getState().chainActions.heard([call(1)]);
    vi.setSystemTime(new Date("2026-11-06T09:00:05.000Z"));
    store.getState().chainActions.heard([call(2), call(3)]);
    expect(store.getState().chainByWorld[chainKey("onyx", "govdao")]?.map(({ height, at }) => [height, at])).toEqual([
      [1, "2026-11-06T09:00:00.000Z"],
      [2, "2026-11-06T09:00:05.000Z"],
      [3, "2026-11-06T09:00:05.000Z"],
    ]);
  });

  it("keeps the last 50 lines of a world, the oldest out", () => {
    const store = createAppStore();
    store.getState().chainActions.heard(Array.from({ length: 70 }, (_, n) => call(n)));
    expect(store.getState().chainByWorld[chainKey("onyx", "govdao")]).toHaveLength(50);
    expect(store.getState().chainByWorld[chainKey("onyx", "govdao")]?.[0]?.height).toBe(20);
  });

  it("holds a call in a world's lines and no deploy, and changes nothing for a batch of deploys alone", () => {
    const store = createAppStore();
    store.getState().chainActions.heard([deploy(5), call(6)]);
    const before = store.getState();
    store.getState().chainActions.heard([deploy(7)]);
    expect(store.getState()).toBe(before);
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

  it("holds a call once: an event heard again (a replay) is not a second line, by its id", () => {
    const store = createAppStore();
    store.getState().chainActions.heard([call(1), call(2)]);
    store.getState().chainActions.heard([call(2), { ...call(2), id: "other:0" }]);
    expect(store.getState().chainByWorld[chainKey("onyx", "govdao")]?.map(({ id }) => id)).toEqual([
      "h1:0",
      "h2:0",
      "other:0",
    ]);
  });

  it("keeps a world's lines apart by universe: a busy chain's world never pushes another's out, and each takes its own 50", () => {
    const store = createAppStore();
    const other = (height: number): ChainEvent => ({ ...call(height), universe: "gnoland" });
    store.getState().chainActions.heard([call(1)]);
    store.getState().chainActions.heard(Array.from({ length: 60 }, (_, n) => other(100 + n)));
    expect(store.getState().chainByWorld[chainKey("onyx", "govdao")]?.map(({ height }) => height)).toEqual([1]);
    expect(store.getState().chainByWorld[chainKey("gnoland", "govdao")]).toHaveLength(50);
  });

  it("keeps taking the lines of a world it holds once 200 worlds are held, and keeps no new one", () => {
    const store = createAppStore();
    store.getState().chainActions.heard(Array.from({ length: 200 }, (_, n) => call(n, `w${String(n)}`)));
    store.getState().chainActions.heard([call(900, "w0"), call(901, "w200")]);
    expect(Object.keys(store.getState().chainByWorld)).toHaveLength(200);
    expect(store.getState().chainByWorld[chainKey("onyx", "w0")]?.map(({ height }) => height)).toEqual([0, 900]);
    expect(store.getState().chainByWorld[chainKey("onyx", "w200")]).toBeUndefined();
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
