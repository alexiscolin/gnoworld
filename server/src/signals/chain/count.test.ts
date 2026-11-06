import { describe, expect, it, vi } from "vitest";
import { loadRealmCount, type Deploy } from "./count.ts";

// Slice 9g: the Earth's realms deployed in the last 24 hours, counted by BLOCK time (a transaction has none, a block has one),
// from nothing stored: a restarted server asks the indexer for the day again, so the count is the same before and after.
const NOW = Date.parse("2026-11-05T12:00:00.000Z");
const ago = (ms: number): string => new Date(NOW - ms).toISOString();
const HOUR = 3_600_000;
const deploy = (height: number, since: number): Deploy => ({ height, time: ago(since) });

describe("the 24 h count", () => {
  it("counts what the indexer gives for the last 24 h, asking from 24 h before now, and drops one older that it returns", async () => {
    const history = vi.fn(() => Promise.resolve([deploy(1, HOUR), deploy(2, 24 * HOUR - 1), deploy(3, 24 * HOUR + 1)]));
    const count = await loadRealmCount({ history, now: () => NOW });
    expect(history).toHaveBeenCalledWith(ago(24 * HOUR));
    expect(count.count()).toBe(2);
  });

  it("is the same after a restart, from the same chain, with nothing kept by the server", async () => {
    const history = () => Promise.resolve([deploy(1, HOUR), deploy(2, 5 * HOUR)]);
    const before = await loadRealmCount({ history, now: () => NOW });
    before.deployed(deploy(3, 1000));
    const after = await loadRealmCount({
      history: () => Promise.resolve([deploy(1, HOUR), deploy(2, 5 * HOUR), deploy(3, 1000)]),
      now: () => NOW,
    });
    expect(after.count()).toBe(before.count());
    expect(after.count()).toBe(3);
  });

  it("counts a live deploy by its block's time, not by when it arrived: a catch-up's old block is not today's", async () => {
    const count = await loadRealmCount({ history: () => Promise.resolve([]), now: () => NOW });
    count.deployed(deploy(10, 25 * HOUR));
    expect(count.count()).toBe(0);
    count.deployed(deploy(11, 1000));
    expect(count.count()).toBe(1);
  });

  it("counts a deploy once, however many times the catch-up reads it", async () => {
    const count = await loadRealmCount({ history: () => Promise.resolve([deploy(5, HOUR)]), now: () => NOW });
    count.deployed(deploy(5, HOUR));
    count.deployed(deploy(5, HOUR));
    expect(count.count()).toBe(1);
    // Two realms in one block are two.
    count.deployed({ height: 5, time: ago(HOUR), id: "second" });
    expect(count.count()).toBe(2);
  });

  it("lets a deploy leave when its block turns 24 h old", async () => {
    let now = NOW;
    const count = await loadRealmCount({ history: () => Promise.resolve([deploy(1, 23 * HOUR)]), now: () => now });
    expect(count.count()).toBe(1);
    now = NOW + HOUR - 1;
    expect(count.count()).toBe(1);
    now = NOW + HOUR + 1;
    expect(count.count()).toBe(0);
  });

  it("starts at none, said so, when the indexer cannot answer: no count is better than a made one", async () => {
    const log = vi.fn();
    const count = await loadRealmCount({ history: () => Promise.reject(new Error("down")), now: () => NOW, log });
    expect(count.count()).toBe(0);
    expect(count.known()).toBe(false);
    expect(log).toHaveBeenCalledWith("chain_history_failed");
    // Asked again, it can be known.
    const again = await loadRealmCount({ history: () => Promise.reject(new Error("down")), now: () => NOW });
    expect(again.known()).toBe(false);
    const known = await loadRealmCount({ history: () => Promise.resolve([]), now: () => NOW });
    expect(known.known()).toBe(true);
  });

  it("can ask its history again, and the deploys it gets are the ones it holds, once", async () => {
    let fail = true;
    const count = await loadRealmCount({
      history: () => (fail ? Promise.reject(new Error("down")) : Promise.resolve([deploy(1, HOUR)])),
      now: () => NOW,
      log: () => undefined,
    });
    count.deployed(deploy(1, HOUR));
    fail = false;
    await count.load();
    expect(count.known()).toBe(true);
    expect(count.count()).toBe(1);
  });

  it("holds 100,000 deploys at most, the oldest first out", async () => {
    const count = await loadRealmCount({ history: () => Promise.resolve([]), now: () => NOW });
    for (let height = 1; height <= 100_001; height += 1)
      count.deployed({ height, time: ago(1000), id: String(height) });
    expect(count.count()).toBe(100_000);
  });
});

// Survivors of StrykerJS: the edge of the day, and the cap that old deploys must not use up.
describe("the 24 h count's edges", () => {
  const DAY = 24 * HOUR;

  it("counts a live deploy whose block is exactly 24 h old, and a deploy until its block is a day and a millisecond old", async () => {
    let time = NOW;
    const count = await loadRealmCount({ history: () => Promise.resolve([]), now: () => time });
    count.deployed(deploy(1, DAY));
    expect(count.count()).toBe(1);
    count.deployed({ height: 2, time: new Date(NOW).toISOString() });
    time = NOW + DAY;
    expect(count.count()).toBe(1);
    time = NOW + DAY + 1;
    expect(count.count()).toBe(0);
  });

  it("holds no deploy older than the day, so a flood of old ones does not push a good one out", async () => {
    const count = await loadRealmCount({ history: () => Promise.resolve([]), now: () => NOW });
    count.deployed(deploy(1, HOUR));
    for (let n = 2; n < 100_003; n += 1) count.deployed({ height: n, time: ago(DAY + HOUR), id: `old${String(n)}` });
    expect(count.count()).toBe(1);
  });
});
