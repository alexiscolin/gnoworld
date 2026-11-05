import { Address, type ChainEvent, type RealmsDeployed } from "@gnoworld/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppStore } from "../../store/index.ts";
import { BATCH_MS, chainFeed } from "./chainFeed.ts";
import { followVerdicts, type VerdictSource } from "./verdicts.ts";

// Slice 9g (red pass): the glue between the stream's single frames and the store's batches. The unit tests of the store call
// `heard` with a batch; this is the path a page takes: frames through the stream client's schemas, then one update a burst.
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

// A stream client on a source of its own, feeding a store through the chain's feed, as the page wires them.
function page() {
  vi.useFakeTimers();
  const listeners = new Map<string, (event: { data: unknown }) => void>();
  const source: VerdictSource = {
    addEventListener: (type, listener) => {
      listeners.set(type, listener);
    },
    close: () => undefined,
    readyState: 1,
  };
  const store = createAppStore();
  const feed = chainFeed(store.getState().chainActions, () => undefined);
  const stop = followVerdicts(["#govdao"], () => undefined, { open: () => source, log: () => undefined, ...feed });
  let told = 0;
  store.subscribe(() => {
    told += 1;
  });
  return {
    store,
    feed,
    stop,
    told: () => told,
    say: (type: string, event: unknown) => listeners.get(type)?.({ data: JSON.stringify(event) }),
  };
}

describe("the chain's feed", () => {
  it("joins 17 frames heard in one burst into one update of the store, and nothing is in the store before the window ends", () => {
    const { store, say, told } = page();
    for (let n = 0; n < 17; n += 1) say("chain", call(900_000 + n));
    expect(store.getState().chainByWorld).toEqual({});
    vi.advanceTimersByTime(BATCH_MS);
    expect(told()).toBe(1);
    expect(store.getState().chainByWorld["govdao"]).toHaveLength(17);
  });

  it("puts a deploy in the ticker's, and a call in its world's, whatever order they came", () => {
    const { store, say } = page();
    say("chain", deploy(5));
    say("chain", call(6));
    vi.advanceTimersByTime(BATCH_MS);
    expect(store.getState().deploys.map(({ height }) => height)).toEqual([5]);
    expect(store.getState().chainByWorld["govdao"]?.map(({ height }) => height)).toEqual([6]);
  });

  it("puts the count in the store at once, from the frame, and a frame that fails its schema nowhere", () => {
    const { store, say } = page();
    say("realms", { universe: "onyx", count: 17, height: 908297 });
    say("realms", { universe: "onyx", count: -1, height: 1 });
    say("chain", { ...call(1), func: "<img src=x>" });
    vi.advanceTimersByTime(BATCH_MS);
    expect(store.getState().realmsDeployed["onyx"]?.count).toBe(17);
    expect(store.getState().chainByWorld).toEqual({});
  });

  it("opens a new window for the next burst, and drops what it holds when the page leaves", () => {
    const { store, say, feed, told } = page();
    say("chain", call(1));
    vi.advanceTimersByTime(BATCH_MS);
    say("chain", call(2));
    vi.advanceTimersByTime(BATCH_MS);
    expect(told()).toBe(2);
    say("chain", call(3));
    feed.stop();
    vi.advanceTimersByTime(BATCH_MS * 5);
    expect(store.getState().chainByWorld["govdao"]).toHaveLength(2);
  });

  it("holds 1,000 events at most in a window", () => {
    const { store, say } = page();
    for (let n = 0; n < 1100; n += 1) say("chain", call(n));
    vi.advanceTimersByTime(BATCH_MS);
    expect(store.getState().chainByWorld["govdao"]).toHaveLength(50);
    expect(store.getState().chainByWorld["govdao"]?.[0]?.height).toBe(1050);
  });
});

// What the page hears, event by event, through the schemas: what the server sends is outside data to the page too, and a frame that
// fails is dropped and said once, as a verdict or a signal is.
const COUNT: RealmsDeployed = { universe: "onyx", count: 17, height: 908297 };
const bidi = String.fromCodePoint(0x202e);
const CALL: ChainEvent = call(900030);

function feedOf() {
  vi.useFakeTimers();
  const heard = vi.fn<(events: readonly ChainEvent[]) => void>();
  const counted = vi.fn<(count: RealmsDeployed) => void>();
  const log = vi.fn<(what: string) => void>();
  const feed = chainFeed({ heard, counted }, log);
  return { feed, heard, counted, log };
}

describe("the chain's events on the page's stream", () => {
  it("hands on a chain event and a count that pass their schemas", () => {
    const { feed, heard, counted } = feedOf();
    feed.chain(JSON.stringify(CALL));
    feed.realms(JSON.stringify(COUNT));
    vi.advanceTimersByTime(BATCH_MS);
    expect(heard).toHaveBeenCalledWith([CALL]);
    expect(counted).toHaveBeenCalledWith(COUNT);
  });

  it.each([
    ["markup in a function", { ...CALL, func: "Vote<img src=x onerror=alert(1)>" }],
    ["a bidi override", { ...CALL, func: `Vote${bidi}` }],
    ["a realm of 10 KB", { ...CALL, realm: `gno.land/r/${"a".repeat(10_000)}` }],
    ["a field more", { ...CALL, args: ["x"] }],
    ["a height as text", { ...CALL, height: "900030" }],
  ])("drops a chain event with %s, and says it once however many come", (_, bad) => {
    const { feed, heard, log } = feedOf();
    feed.chain(JSON.stringify(bad));
    feed.chain(JSON.stringify(bad));
    feed.chain("not json");
    feed.chain(7);
    vi.advanceTimersByTime(BATCH_MS);
    expect(heard).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("chain_unknown");
  });

  it("drops a count that fails its schema, and says it once", () => {
    const { feed, counted, log } = feedOf();
    feed.realms(JSON.stringify({ ...COUNT, count: -1 }));
    feed.realms(JSON.stringify({ ...COUNT, count: "17" }));
    expect(counted).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("realms_unknown");
  });

  it("keeps hearing after a frame it dropped", () => {
    const { feed, heard } = feedOf();
    feed.chain(JSON.stringify({ ...CALL, func: "<b>" }));
    feed.chain(JSON.stringify(CALL));
    vi.advanceTimersByTime(BATCH_MS);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
