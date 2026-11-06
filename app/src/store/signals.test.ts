import { Address, type Signal } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { createAppStore } from "./index.ts";

// Slice 9h: the signals' slice, the stream's signals alone, each world's first of each kind. Who may see a banner is the
// banner's to say (Banners.tsx), by the account the signal names.
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const BOB = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const chart = (account: Address, world = "fresh-mint"): Signal => ({
  kind: "chart",
  world,
  account,
  at: "2026-11-05T12:00:00.000Z",
});

describe("the signals' slice", () => {
  it("starts with no signal", () => {
    expect(createAppStore().getState().signals).toEqual([]);
  });

  it("holds a signal from the stream", () => {
    const store = createAppStore();
    store.getState().signalActions.signaled(chart(ALICE));
    expect(store.getState().signals).toEqual([chart(ALICE)]);
  });

  it("keeps the first signal of a world and a kind: a later one of another account changes nothing", () => {
    const store = createAppStore();
    store.getState().signalActions.signaled(chart(ALICE));
    const before = store.getState().signals;
    store.getState().signalActions.signaled(chart(BOB));
    expect(store.getState().signals).toBe(before);
  });

  it("keeps worlds and kinds apart", () => {
    const store = createAppStore();
    const { signaled } = store.getState().signalActions;
    const words: Signal = { ...chart(BOB), kind: "words" };
    signaled(chart(ALICE));
    signaled(words);
    signaled(chart(BOB, "govdao"));
    expect(store.getState().signals).toEqual([chart(ALICE), words, chart(BOB, "govdao")]);
  });

  it("holds 200 signals at most, the newest", () => {
    const store = createAppStore();
    for (let world = 0; world < 201; world += 1)
      store.getState().signalActions.signaled(chart(ALICE, `w${String(world)}`));
    const held = store.getState().signals;
    expect(held).toHaveLength(200);
    expect(held[0]?.world).toBe("w1");
    expect(held.at(-1)?.world).toBe("w200");
  });
});
