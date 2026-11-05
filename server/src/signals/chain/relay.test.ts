import { Address, toAddress, type ChainEvent, type RealmsDeployed } from "@gnoworld/schemas";
import { describe, expect, it, vi } from "vitest";
import { loadRealmCount } from "./count.ts";
import { makeRelay } from "./relay.ts";
import type { ChainRead } from "./message.ts";

// Slice 9g: what the subscription's reads become on the stream: coalesced to 4 a second a room, each event with its block
// height; the Earth's count from block times only (a transaction carries none, so a deploy waits for its block).
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
// A flood is of many accounts: each has its own address.
const actorN = (n: number): Address => Address.parse(toAddress(new Uint8Array(20).fill(n % 256)));
const call = (height: number, world = "govdao", actor: Address = ALICE): ChainEvent => ({
  kind: "call",
  universe: "onyx",
  world,
  realm: "gno.land/r/gov/dao",
  func: "MustVoteOnProposal",
  actor,
  height,
});
const deploy = (height: number, name = `r${String(height)}`, actor: Address = ALICE): ChainEvent => ({
  kind: "deploy",
  universe: "onyx",
  realm: `gno.land/r/${ALICE}/${name}`,
  actor,
  height,
});
const events = (...list: ChainEvent[]): ChainRead => ({ events: list });
const NOW = Date.parse("2026-11-05T12:00:00.000Z");

function setup() {
  let time = 0;
  const chain = vi.fn<(event: ChainEvent) => void>();
  const realms = vi.fn<(count: RealmsDeployed) => void>();
  const deployed = vi.fn<(deploy: { height: number; time: string }) => void>();
  // The fake count: what it was loaded with, and whether the indexer could tell it.
  let total = 0;
  let known = true;
  const relay = makeRelay({
    stream: { chain, realms },
    count: {
      deployed: (d) => {
        deployed(d);
        total += 1;
      },
      count: () => total,
      known: () => known,
    },
    universe: "onyx",
    now: () => time,
  });
  return {
    relay,
    chain,
    realms,
    deployed,
    at: (ms: number) => (time = ms),
    loaded: (count: number, isKnown = true) => {
      total = count;
      known = isKnown;
    },
  };
}
const block = (height: number, ago = 1000): ChainRead => ({
  events: [],
  block: { height, time: new Date(NOW - ago).toISOString() },
});

describe("the relay", () => {
  it("tells each event on the stream with its height as it is", () => {
    const { relay, chain } = setup();
    relay(events(call(900030, "govdao", actorN(1)), call(900031, "govdao", actorN(2))));
    expect(chain.mock.calls.map(([event]) => event.height)).toEqual([900030, 900031]);
  });

  it("lets 4 events a second a room through in a flood of 100, and each room has its own", () => {
    const { relay, chain } = setup();
    for (let n = 0; n < 100; n += 1) relay(events(call(n, "govdao", actorN(n)), call(n, "bubble", actorN(n))));
    expect(chain.mock.calls.filter(([event]) => event.kind === "call" && event.world === "govdao")).toHaveLength(4);
    expect(chain.mock.calls.filter(([event]) => event.kind === "call" && event.world === "bubble")).toHaveLength(4);
    // The first four are kept: the heights tell a reader where a gap is.
    expect(
      chain.mock.calls
        .filter(([event]) => event.kind === "call" && event.world === "govdao")
        .map(([event]) => event.height),
    ).toEqual([0, 1, 2, 3]);
  });

  // F5792: the cap keeps the first four of a second, so one account at the head of each block must not fill a room alone.
  it("shows one call of an account in a room's second: four of an attacker's, then a visitor's, are two lines", () => {
    const { relay, chain } = setup();
    const KAITO = Address.parse("g1cvr48r7l7lkmvp77cr6zg2zhu26jgfwr0y8pew");
    relay(events(call(1), call(1), call(1), call(1), call(1, "govdao", KAITO)));
    expect(chain.mock.calls.map(([event]) => event.actor)).toEqual([ALICE, KAITO]);
  });

  it("shows one deploy of an account in the ticker's second: three of one creator's are one line", () => {
    const { relay, chain } = setup();
    relay(events(deploy(1, "a"), deploy(1, "b"), deploy(1, "c")));
    expect(chain.mock.calls).toHaveLength(1);
  });

  it("keeps the deploys to the ticker's budget apart from a world's: a flood of calls does not starve it", () => {
    const { relay, chain } = setup();
    for (let n = 0; n < 50; n += 1) relay(events(call(n, "govdao", actorN(n))));
    relay(events(deploy(900)));
    expect(chain.mock.calls.at(-1)?.[0]).toEqual(deploy(900));
  });

  it("counts a deploy only once its block's time is known, then tells the count at that block's height", () => {
    const { relay, deployed, realms } = setup();
    relay(events(deploy(887427)));
    expect(deployed).not.toHaveBeenCalled();
    expect(realms).not.toHaveBeenCalled();
    relay({ events: [], block: { height: 887427, time: new Date(NOW - 1000).toISOString() } });
    expect(deployed).toHaveBeenCalledWith(
      expect.objectContaining({ height: 887427, time: new Date(NOW - 1000).toISOString() }),
    );
    expect(realms).toHaveBeenCalledWith({ universe: "onyx", count: 1, height: 887427 });
  });

  it("counts a deploy at once when its block came first", () => {
    const { relay, realms } = setup();
    relay({ events: [], block: { height: 500, time: new Date(NOW - 5000).toISOString() } });
    relay(events(deploy(500)));
    expect(realms).toHaveBeenCalledWith({ universe: "onyx", count: 1, height: 500 });
  });

  it("holds 1,000 deploys at most while they wait for their block, the oldest first out, so a block that never comes costs nothing", () => {
    const { relay, deployed } = setup();
    for (let n = 0; n < 1100; n += 1) relay(events(deploy(10_000 + n)));
    const time = new Date(NOW - 1000).toISOString();
    relay({ events: [], block: { height: 10_000, time } });
    expect(deployed).not.toHaveBeenCalled();
    relay({ events: [], block: { height: 11_099, time } });
    expect(deployed).toHaveBeenCalledTimes(1);
    // The edge: the 1,000 newest are kept (10,100 on), the one before is not.
    relay({ events: [], block: { height: 10_100, time } });
    expect(deployed).toHaveBeenCalledTimes(2);
    relay({ events: [], block: { height: 10_099, time } });
    expect(deployed).toHaveBeenCalledTimes(2);
  });

  // F5781: the blocks' times the relay remembers for the deploys that come after are bounded too.
  it("remembers the times of the last 100 blocks only: a deploy of an older block waits, one of the oldest kept is counted", () => {
    const { relay, deployed } = setup();
    for (let height = 1; height <= 101; height += 1) relay(block(height));
    relay(events(deploy(1)));
    expect(deployed).not.toHaveBeenCalled();
    relay(events(deploy(2)));
    expect(deployed).toHaveBeenCalledTimes(1);
    expect(deployed).toHaveBeenCalledWith(expect.objectContaining({ height: 2 }));
  });

  it("counts a deploy that waited once, however many times its block's frame comes", () => {
    const { relay, deployed } = setup();
    relay(events(deploy(9)));
    relay(block(9));
    relay(block(9));
    expect(deployed).toHaveBeenCalledTimes(1);
  });

  // Red pass: a bot deploying 100 realms a second is 4 events a second to every ticker, and every deploy is still counted.
  it("tells the ticker 4 deploys a second in a flood of 100, counts all 100 once their blocks come, and admits a new one the second after", () => {
    const { relay, chain, deployed, at } = setup();
    for (let n = 0; n < 100; n += 1) relay(events(deploy(n, `r${String(n)}`, actorN(n))));
    expect(chain.mock.calls.filter(([event]) => event.kind === "deploy")).toHaveLength(4);
    for (let n = 0; n < 100; n += 1) relay(block(n));
    expect(deployed).toHaveBeenCalledTimes(100);
    at(1000);
    relay(events(deploy(500, "r500", actorN(500))));
    expect(chain.mock.calls.filter(([event]) => event.kind === "deploy")).toHaveLength(5);
  });

  it("tells the count once for a batch of deploys in one block, not once for each", () => {
    const { relay, realms } = setup();
    relay(events(...Array.from({ length: 100 }, (_, n) => deploy(7, `r${String(n)}`))));
    relay(block(7));
    expect(realms).toHaveBeenCalledTimes(1);
    expect(realms).toHaveBeenCalledWith({ universe: "onyx", count: 100, height: 7 });
  });

  it("tells no count while the indexer's history could not load, and tells it once it can: a made 1 is no count", () => {
    const { relay, realms, loaded } = setup();
    loaded(0, false);
    relay(block(5));
    relay(events(deploy(6)));
    relay(block(6));
    expect(realms).not.toHaveBeenCalled();
    loaded(17, true);
    relay(block(7));
    expect(realms).toHaveBeenCalledWith({ universe: "onyx", count: 17, height: 7 });
  });
});

// The relay with the real count, from the chain's own deploys and blocks.
describe("the relay with the 24 h count", () => {
  const HOUR = 3_600_000;
  const withCount = async (ago: number[]) => {
    let time = NOW;
    const realms = vi.fn<(count: RealmsDeployed) => void>();
    const chain = vi.fn<(event: ChainEvent) => void>();
    const count = await loadRealmCount({
      history: () =>
        Promise.resolve(
          ago.map((since, n) => ({ height: n + 1, time: new Date(NOW - since).toISOString(), id: `h${String(n)}` })),
        ),
      now: () => time,
    });
    const relay = makeRelay({ stream: { chain, realms }, count, universe: "onyx", now: () => time });
    return { relay, realms, at: (ms: number) => (time = ms) };
  };

  it("tells the count loaded at start with the first block's height, with no deploy since the server began", async () => {
    const { relay, realms } = await withCount([HOUR, 2 * HOUR, 3 * HOUR]);
    relay(block(908297));
    expect(realms).toHaveBeenCalledWith({ universe: "onyx", count: 3, height: 908297 });
  });

  it("tells a smaller count at the block that sees deploys turn 24 h old", async () => {
    const { relay, realms, at } = await withCount([HOUR, 23.5 * HOUR, 23.8 * HOUR]);
    relay(block(100));
    at(NOW + HOUR);
    relay({ events: [], block: { height: 101, time: new Date(NOW + HOUR).toISOString() } });
    expect(realms.mock.calls.map(([count]) => count.count)).toEqual([3, 1]);
    expect(realms.mock.calls[1]?.[0].height).toBe(101);
  });

  it("counts two realms deployed in one block as two, and a deploy given twice as one", async () => {
    const { relay, realms } = await withCount([]);
    relay(events(deploy(50, "a"), deploy(50, "b")));
    relay(block(50));
    expect(realms).toHaveBeenLastCalledWith({ universe: "onyx", count: 2, height: 50 });
    relay(events(deploy(50, "a")));
    relay(block(50));
    expect(realms).toHaveBeenCalledTimes(1);
  });
});
