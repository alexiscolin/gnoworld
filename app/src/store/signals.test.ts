import { Address, type Signal, type WorldFirsts } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { createAppStore } from "./index.ts";

// Slice 9h: the signals' slice. `arrivals` come from the stream's signals alone, which is what a banner shows;
// `firsts` are what a world's plate says, from the stream or from the server's answer to a read. A read never makes
// an arrival: a banner is never shown from a page load, only from the server's signal.
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const BOB = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const chart = (account: Address, world = "fresh-mint"): Signal => ({
  kind: "chart",
  world,
  account,
  at: "2026-11-05T12:00:00.000Z",
});

describe("the signals' slice", () => {
  it("starts with no arrival and no first", () => {
    const { signals } = createAppStore().getState();
    expect(signals.arrivals).toEqual({});
    expect(signals.firsts).toEqual({});
  });

  it("takes a signal from the stream as the world's arrival and as its first", () => {
    const store = createAppStore();
    store.getState().signalActions.signaled(chart(ALICE));
    const { signals } = store.getState();
    expect(signals.arrivals["fresh-mint"]?.chart?.account).toBe(ALICE);
    expect(signals.firsts["fresh-mint"]?.charted?.account).toBe(ALICE);
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
    signaled(chart(ALICE));
    signaled({ ...chart(BOB), kind: "words" });
    signaled(chart(BOB, "govdao"));
    const { arrivals } = store.getState().signals;
    expect(arrivals["fresh-mint"]?.chart?.account).toBe(ALICE);
    expect(arrivals["fresh-mint"]?.words?.account).toBe(BOB);
    expect(arrivals["govdao"]?.chart?.account).toBe(BOB);
  });

  it("takes the server's answer to a read as the plate's first, never as an arrival", () => {
    const store = createAppStore();
    const firsts: WorldFirsts = {
      world: "fresh-mint",
      charted: { account: ALICE, at: "2026-11-05T12:00:00.000Z" },
      words: null,
    };
    store.getState().signalActions.firstsRead(firsts);
    const { signals } = store.getState();
    expect(signals.firsts["fresh-mint"]?.charted?.account).toBe(ALICE);
    expect(signals.arrivals).toEqual({});
  });

  it("holds a world named like an Object's own key as an own entry", () => {
    const store = createAppStore();
    store.getState().signalActions.signaled(chart(ALICE, "constructor"));
    expect(Object.hasOwn(store.getState().signals.arrivals, "constructor")).toBe(true);
    expect(Object.hasOwn(store.getState().signals.arrivals, "toString")).toBe(false);
  });

  it("is forgotten when another account's session follows (a banner is the one who earned it's)", () => {
    const store = createAppStore();
    store.getState().loginActions.signedIn(Address.parse(ALICE));
    store.getState().signalActions.signaled(chart(ALICE));
    store.getState().loginActions.signedIn(Address.parse(BOB));
    expect(store.getState().signals.arrivals).toEqual({});
  });

  // The page asks who is first when it opens and the stream may tell it before the answer comes: the answer, old by then,
  // never takes a first away, and never replaces the one held.
  it("keeps a first the stream told, when an older read answers none after it", () => {
    const store = createAppStore();
    store.getState().signalActions.signaled(chart(ALICE));
    store.getState().signalActions.firstsRead({ world: "fresh-mint", charted: null, words: null });
    expect(store.getState().signals.firsts["fresh-mint"]?.charted?.account).toBe(ALICE);
  });

  it("keeps the first a read gave, when a signal of another account comes after it", () => {
    const store = createAppStore();
    const at = "2026-11-05T12:00:00.000Z";
    store.getState().signalActions.firstsRead({ world: "fresh-mint", charted: { account: ALICE, at }, words: null });
    store.getState().signalActions.signaled(chart(BOB));
    expect(store.getState().signals.firsts["fresh-mint"]?.charted?.account).toBe(ALICE);
  });
});
