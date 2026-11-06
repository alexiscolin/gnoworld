import { describe, expect, it, vi } from "vitest";
import { call, rowOf } from "../../testing/chainRecorded.ts";
import { answerOf, type FakeRow } from "../../testing/fakeIndexer.ts";
import { indexerReaders, MAX_BYTES, PAGE, type Page } from "./indexer.ts";
import type { ChainRead } from "./message.ts";
import { PAGES, pollChain, POLL_MS, SEEN, timer, type PollOptions } from "./poll.ts";

// Slice 9g: the one poll of a universe's public indexer, once a block (answer 9g-4, by Alexis). Every test drives a fake clock
// (a timer runs when the test fires it, never by itself) and fake reads, and waits on the poll's own events, never on time.
const ACCESS = "gno.land/r/g14wv9hyngyrzpxn3ztvnx2jygs50m0240qncm8j/access";

const queryOf = (init: RequestInit): string =>
  (JSON.parse(typeof init.body === "string" ? init.body : "") as { query: string }).query;

// A transaction row at a place, as a recorded call with its height, index and hash changed.
const txRow = (height: number, hash: string, index = 0): Record<string, unknown> => ({
  ...rowOf(call),
  block_height: height,
  hash,
  index,
});
const tx = (height: number, hash: string, index = 0) => ({ height, index, row: txRow(height, hash, index) });
const page = (rows: Page["rows"], over: Partial<Page> = {}): Page => ({
  rows,
  times: new Map<number, string>(),
  more: false,
  ...over,
});

function setup(over: Partial<PollOptions> = {}) {
  const delivered: ChainRead[] = [];
  const log = vi.fn<PollOptions["log"]>();
  const timers: { ms: number; run: () => void; live: boolean }[] = [];
  const options: PollOptions = {
    universe: "onyx",
    watch: new Map([[ACCESS, { world: "access" }]]),
    tip: () => Promise.resolve(7000),
    catchUp: () => Promise.resolve(page([])),
    random: () => 0.5,
    deliver: (read) => delivered.push(read),
    log,
    after: (ms, run) => {
      const each = { ms, run, live: true };
      timers.push(each);
      return () => {
        each.live = false;
      };
    },
    ...over,
  };
  const poll = pollChain(options);
  /** The timers waiting for their time. */
  const pending = () => timers.filter(({ live }) => live);
  /** Waits for the round in flight to end, then lets the next one start at once. */
  const next = async (): Promise<number> => {
    await vi.waitFor(() => {
      expect(pending()).toHaveLength(1);
    });
    const waiting = pending()[0];
    if (waiting === undefined) throw new Error("no timer");
    waiting.live = false;
    waiting.run();
    return waiting.ms;
  };
  const heights = () => delivered.flatMap((read) => read.events.map((event) => event.height));
  const tips = () => delivered.flatMap((read) => (read.tip === undefined ? [] : [read.tip]));
  return { poll, delivered, log, timers, pending, next, heights, tips };
}

// Tips given in turn (the last one again and again): the round that asks the n-th.
const tipsOf = (heights: number[]) => {
  let round = 0;
  return () => Promise.resolve(heights[Math.min(round++, heights.length - 1)] ?? 0);
};

describe("the poll", () => {
  it("asks the tip at once and again once a block (3.4 s) after each round, never on an interval", async () => {
    const tip = vi.fn(() => Promise.resolve(7000));
    const { next, pending } = setup({ tip });
    expect(tip).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(pending().map(({ ms }) => ms)).toEqual([POLL_MS]);
    });
    expect(POLL_MS).toBe(3400);
    await next();
    expect(tip).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => {
      expect(pending().map(({ ms }) => ms)).toEqual([POLL_MS]);
    });
  });

  it("starts at the first tip when none is known: nothing before it is read, and the tip is told", async () => {
    const catchUp = vi.fn(() => Promise.resolve(page([])));
    const { next, tips } = setup({ catchUp });
    await next();
    await vi.waitFor(() => {
      expect(tips()).toEqual([7000, 7000]);
    });
    expect(catchUp).not.toHaveBeenCalled();
  });

  it("starts after the block the history read reached, and reads nothing from before it", async () => {
    const catchUp = vi.fn<PollOptions["catchUp"]>(() => Promise.resolve(page([])));
    setup({ from: 6990, catchUp });
    await vi.waitFor(() => {
      expect(catchUp).toHaveBeenCalledTimes(1);
    });
    expect(catchUp.mock.calls[0]?.slice(0, 2)).toEqual([{ height: 6990 }, 7000]);
  });

  it("catches up from the place of the last row, with no gap and no double across rounds, and no re-read of its block (F5887)", async () => {
    const answers = [page([tx(7001, "a"), tx(7002, "b"), tx(7003, "c")]), page([tx(7003, "d", 1), tx(7004, "e")])];
    const catchUp = vi.fn<PollOptions["catchUp"]>(() => Promise.resolve(answers.shift() ?? page([])));
    const { next, heights } = setup({ tip: tipsOf([7000, 7003, 7004]), catchUp });
    await next();
    await vi.waitFor(() => {
      expect(heights()).toEqual([7001, 7002, 7003]);
    });
    await next();
    await vi.waitFor(() => {
      expect(heights()).toEqual([7001, 7002, 7003, 7003, 7004]);
    });
    expect(catchUp.mock.calls.map(([after, tip]) => [after, tip])).toEqual([
      [{ height: 7000 }, 7003],
      [{ height: 7003, index: 0 }, 7004],
    ]);
  });

  it("asks no catch-up while the tip has not moved, however far its last row is behind, and tells the tip all the same (F5887)", async () => {
    const catchUp = vi.fn(() => Promise.resolve(page([tx(7001, "a")])));
    const { next, tips } = setup({ tip: tipsOf([7000, 7005]), catchUp });
    await next();
    await next();
    await next();
    await vi.waitFor(() => {
      expect(tips()).toEqual([7000, 7005, 7005, 7005]);
    });
    expect(catchUp).toHaveBeenCalledTimes(1);
  });

  it("tells the tip after the round's reads, so the count is told once the deploys are counted", async () => {
    const { next, delivered } = setup({
      tip: tipsOf([7000, 7002]),
      catchUp: () => Promise.resolve(page([tx(7001, "a"), tx(7002, "b")])),
    });
    await next();
    await vi.waitFor(() => {
      expect(delivered).toHaveLength(4);
    });
    expect(delivered.map((read) => read.tip ?? read.events[0]?.height)).toEqual([7000, 7001, 7002, 7002]);
    expect(delivered[3]).toEqual({ events: [], tip: 7002 });
  });

  it("tells a deployed realm's block, once and as its time in ISO, before the first transaction of that block", async () => {
    const times = new Map([[7001, "2026-11-06T00:00:00.123456789Z"]]);
    const { next, delivered } = setup({
      tip: tipsOf([7000, 7001]),
      catchUp: () => Promise.resolve(page([tx(7001, "a", 0), tx(7001, "b", 1)], { times })),
    });
    await next();
    await vi.waitFor(() => {
      expect(delivered).toHaveLength(5);
    });
    expect(delivered[1]).toEqual({ events: [], block: { height: 7001, time: "2026-11-06T00:00:00.123Z" } });
    expect(delivered.slice(2, 4).map((read) => read.hash)).toEqual(["a", "b"]);
    expect(delivered.filter((read) => read.block !== undefined)).toHaveLength(1);
  });

  it("says a row message.ts refuses once, and passes it: the cursor moves to its place, so no round reads it again (F5887)", async () => {
    const bad = { height: 7001, index: 0, row: { hash: 7 } };
    const catchUp = vi.fn<PollOptions["catchUp"]>(({ height }) =>
      Promise.resolve(height === 7000 ? page([bad]) : page([])),
    );
    const { next, log, tips, delivered } = setup({ tip: tipsOf([7000, 7001, 7002, 7003]), catchUp });
    await next();
    await next();
    await next();
    await vi.waitFor(() => {
      expect(tips()).toHaveLength(4);
    });
    expect(log.mock.calls).toEqual([["chain_message_bad"]]);
    // A refused row tells the rooms nothing: only the tips were delivered.
    expect(delivered.every((read) => read.tip !== undefined)).toBe(true);
    expect(catchUp.mock.calls.map(([after]) => after)).toEqual([
      { height: 7000 },
      { height: 7001, index: 0 },
      { height: 7001, index: 0 },
    ]);
  });

  it("gives a text of no watched realm as no event, and says nothing of it", async () => {
    const other = { ...txRow(7001, "a"), messages: [] };
    const { next, delivered, log } = setup({
      tip: tipsOf([7000, 7001]),
      catchUp: () => Promise.resolve(page([{ height: 7001, index: 0, row: other }])),
    });
    await next();
    await vi.waitFor(() => {
      expect(delivered).toHaveLength(3);
    });
    expect(delivered[1]?.events).toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });

  it("delivers a page and moves the cursor as it comes: a slow indexer still advances (F5886)", async () => {
    const second = Promise.withResolvers<Page>();
    let asked = 0;
    const catchUp = vi.fn<PollOptions["catchUp"]>(() =>
      ++asked === 1 ? Promise.resolve(page([tx(7001, "a"), tx(7002, "b")], { more: true })) : second.promise,
    );
    const { next, heights, pending } = setup({ tip: tipsOf([7000, 7005]), catchUp });
    await next();
    await vi.waitFor(() => {
      expect(heights()).toEqual([7001, 7002]);
    });
    expect(catchUp).toHaveBeenCalledTimes(2);
    expect(catchUp.mock.calls[1]?.[0]).toEqual({ height: 7002, index: 0 });
    expect(pending()).toEqual([]);
    second.resolve(page([tx(7003, "c")]));
    await vi.waitFor(() => {
      expect(heights()).toEqual([7001, 7002, 7003]);
    });
  });

  it("reads a block of any size across its pages, then the rest, in order, none twice (F5885)", async () => {
    const rows: FakeRow[] = [
      ...Array.from({ length: 600 }, (_, n) => ({ height: 101, index: n, row: txRow(101, `h${String(n)}`, n) })),
      ...Array.from({ length: 5 }, (_, n) => ({ height: 102 + n, index: 0, row: txRow(102 + n, `t${String(n)}`) })),
    ];
    let tip = 100;
    const readers = indexerReaders({
      url: "https://indexer.example.test/graphql/query",
      watch: new Map([[ACCESS, { world: "access" }]]),
      log: () => undefined,
      send: (_, init) => Promise.resolve(answerOf({ tip: () => tip, rows: () => rows }, queryOf(init))),
    });
    const { next, delivered, tips } = setup({
      tip: () => readers.tip(),
      catchUp: (after, upTo, signal) => readers.catchUp(after, upTo, signal),
      from: 100,
    });
    for (let block = 101; block <= 106; block += 1) {
      tip = block;
      await next();
      await vi.waitFor(() => {
        expect(tips().at(-1)).toBe(block);
      });
    }
    const hashes = delivered.flatMap((read) => (read.hash === undefined ? [] : [read.hash]));
    expect(hashes).toHaveLength(605);
    expect(hashes.slice(0, 600)).toEqual(Array.from({ length: 600 }, (_, n) => `h${String(n)}`));
    expect(hashes.slice(600)).toEqual(["t0", "t1", "t2", "t3", "t4"]);
    expect(PAGE).toBe(500);
  });

  it("goes on in the next round when a round took its pages' cap, said, though the tip did not move (F5886)", async () => {
    let asked = 0;
    const catchUp = vi.fn<PollOptions["catchUp"]>(() => {
      asked += 1;
      return Promise.resolve(page([tx(7000 + asked, `h${String(asked)}`)], { more: true }));
    });
    const { next, log, tips } = setup({ tip: tipsOf([7000, 7100]), catchUp });
    await next();
    await vi.waitFor(() => {
      expect(tips()).toHaveLength(2);
    });
    expect(PAGES).toBe(5);
    expect(catchUp).toHaveBeenCalledTimes(PAGES);
    expect(log.mock.calls).toEqual([["chain_catch_up_capped"]]);
    await next();
    await vi.waitFor(() => {
      expect(catchUp).toHaveBeenCalledTimes(PAGES * 2);
    });
    expect(catchUp.mock.calls[PAGES]?.[0]).toEqual({ height: 7005, index: 0 });
  });

  it("stops when the page was the last, and asks no more until the tip moves again", async () => {
    const catchUp = vi.fn<PollOptions["catchUp"]>(() => Promise.resolve(page([tx(7001, "a")])));
    const { next, tips, log } = setup({ tip: tipsOf([7000, 7001]), catchUp });
    await next();
    await next();
    await vi.waitFor(() => {
      expect(tips()).toHaveLength(3);
    });
    expect(catchUp).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });

  it("goes on past a page that was halved, and past a row skipped, whose place moves the cursor", async () => {
    const answers = [
      page([], { more: true }),
      page([], { more: true, skipped: { height: 7001, index: 3 } }),
      page([tx(7001, "a", 4)]),
    ];
    const catchUp = vi.fn<PollOptions["catchUp"]>(() => Promise.resolve(answers.shift() ?? page([])));
    const { next, heights } = setup({ tip: tipsOf([7000, 7002]), catchUp });
    await next();
    await vi.waitFor(() => {
      expect(heights()).toEqual([7001]);
    });
    expect(catchUp.mock.calls.map(([after]) => after)).toEqual([
      { height: 7000 },
      { height: 7000 },
      { height: 7001, index: 3 },
    ]);
  });

  it("drops a row above the tip, said, and does not move the cursor for it: the next page asks after the last good row (F5888)", async () => {
    const answers = [
      page([tx(7001, "a"), tx(9_000_000_000_000_000, "liar"), tx(7003, "late")], { more: true }),
      page([tx(9_000_000_000_000_000, "liar")], { more: true }),
    ];
    const catchUp = vi.fn<PollOptions["catchUp"]>(() => Promise.resolve(answers.shift() ?? page([])));
    const { next, heights, log } = setup({ tip: tipsOf([7000, 7002]), catchUp });
    await next();
    await vi.waitFor(() => {
      expect(catchUp).toHaveBeenCalledTimes(2);
    });
    await vi.waitFor(() => {
      expect(log).toHaveBeenCalledTimes(3);
    });
    expect(heights()).toEqual([7001]);
    expect(log.mock.calls.every(([what]) => what === "chain_height_ahead")).toBe(true);
    expect(catchUp.mock.calls[1]?.[0]).toEqual({ height: 7001, index: 0 });
  });

  it("stops a round whose page moved nothing, so a liar's page is asked once, not five times", async () => {
    const catchUp = vi.fn<PollOptions["catchUp"]>(() => Promise.resolve(page([tx(9999, "liar")], { more: true })));
    const { next, tips, log } = setup({ tip: tipsOf([7000, 7002]), catchUp });
    await next();
    await vi.waitFor(() => {
      expect(tips()).toHaveLength(2);
    });
    expect(catchUp).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalledWith("chain_catch_up_capped");
  });

  it("says a tip that went back, and starts again at it: the rooms are not silent until a restart (F5888)", async () => {
    const catchUp = vi.fn<PollOptions["catchUp"]>(() => Promise.resolve(page([tx(1001, "a")])));
    const { next, log, tips } = setup({ tip: tipsOf([1000, 1002, 5, 6]), catchUp });
    await next();
    await next();
    await vi.waitFor(() => {
      expect(tips()).toEqual([1000, 1002, 5]);
    });
    expect(log.mock.calls).toEqual([["chain_tip_back"]]);
    expect(catchUp).toHaveBeenCalledTimes(1);
    await next();
    await vi.waitFor(() => {
      expect(catchUp).toHaveBeenCalledTimes(2);
    });
    expect(catchUp.mock.calls[1]?.slice(0, 2)).toEqual([{ height: 5 }, 6]);
  });

  it("says a tip below what was caught up to though above the last row's block", async () => {
    const catchUp = vi.fn<PollOptions["catchUp"]>(() => Promise.resolve(page([tx(3, "a")])));
    const { next, log, tips } = setup({ tip: tipsOf([2, 1000, 5, 5]), catchUp });
    await next();
    await next();
    await vi.waitFor(() => {
      expect(tips()).toEqual([2, 1000, 5]);
    });
    expect(log.mock.calls).toEqual([["chain_tip_back"]]);
  });

  it("delivers every block's read: a block has no hash to read it once by", async () => {
    const times = new Map([
      [7001, "2026-11-06T00:00:00Z"],
      [7002, "2026-11-06T00:00:03Z"],
    ]);
    const { next, delivered, tips } = setup({
      tip: tipsOf([7000, 7002]),
      catchUp: () => Promise.resolve(page([tx(7001, "a"), tx(7002, "b")], { times })),
    });
    await next();
    await vi.waitFor(() => {
      expect(tips()).toHaveLength(2);
    });
    expect(delivered.flatMap((read) => (read.block === undefined ? [] : [read.block.height]))).toEqual([7001, 7002]);
  });

  it("gives a transaction told twice as one, by its hash", async () => {
    const { next, heights } = setup({
      tip: tipsOf([7000, 7002]),
      catchUp: () => Promise.resolve(page([tx(7001, "same", 0), tx(7001, "same", 1)])),
    });
    await next();
    await vi.waitFor(() => {
      expect(heights()).toEqual([7001]);
    });
  });
});

describe("a round in flight", () => {
  it("is the only one: no timer is armed and no second read is made until it ends", async () => {
    const answer = Promise.withResolvers<number>();
    const tip = vi.fn(() => answer.promise);
    const { pending, next } = setup({ tip });
    await Promise.resolve();
    expect(pending()).toEqual([]);
    expect(tip).toHaveBeenCalledTimes(1);
    answer.resolve(7000);
    await next();
    expect(tip).toHaveBeenCalledTimes(2);
  });

  it("has no time limit of its own: each request has its own, and what a page gave is kept", () => {
    const { timers } = setup({ tip: () => new Promise<number>(() => undefined) });
    expect(timers).toEqual([]);
  });

  it("gives a signal to the tip and to the catch-up, one for the round, and a new one for the next", async () => {
    const signals: AbortSignal[] = [];
    const { next } = setup({
      tip: (signal) => {
        signals.push(signal);
        return Promise.resolve(signals.length === 1 ? 7000 : 7001);
      },
      catchUp: (_, __, signal) => {
        signals.push(signal);
        return Promise.resolve(page([]));
      },
    });
    await next();
    await vi.waitFor(() => {
      expect(signals).toHaveLength(3);
    });
    expect(signals[0]).not.toBe(signals[1]);
    expect(signals[1]).toBe(signals[2]);
    expect(signals.every((signal) => !signal.aborted)).toBe(true);
  });
});

describe("a round that fails", () => {
  it("backs off with a jitter that doubles from a second to 30 s, half of it fixed, said once each", async () => {
    const { next, log } = setup({ tip: () => Promise.reject(new Error("down")) });
    const waits: number[] = [];
    for (let n = 0; n < 7; n += 1) {
      waits.push(await next());
      await vi.waitFor(() => {
        expect(log).toHaveBeenCalledTimes(n + 1);
      });
    }
    // random() is 0.5: half the base plus half of it times a half.
    expect(waits).toEqual([750, 1500, 3000, 6000, 12_000, 22_500, 22_500]);
    expect(log.mock.calls.every(([what]) => what === "chain_poll_failed")).toBe(true);
  });

  it("waits from half the base to the whole of it, as random() gives", async () => {
    const low = setup({ tip: () => Promise.reject(new Error("down")), random: () => 0 });
    await vi.waitFor(() => {
      expect(low.pending().map(({ ms }) => ms)).toEqual([500]);
    });
    const high = setup({ tip: () => Promise.reject(new Error("down")), random: () => 1 });
    await vi.waitFor(() => {
      expect(high.pending().map(({ ms }) => ms)).toEqual([1000]);
    });
  });

  it("leaves the cursor, reads the gap on the next good round, and starts the backoff again", async () => {
    const down = { tip: true, catchUp: false };
    let height = 7000;
    const catchUp = vi.fn<PollOptions["catchUp"]>(() =>
      down.catchUp ? Promise.reject(new Error("down")) : Promise.resolve(page([tx(7001, "a"), tx(7005, "b")])),
    );
    const { next, heights, pending, log } = setup({
      tip: () => (down.tip ? Promise.reject(new Error("down")) : Promise.resolve(height)),
      catchUp,
    });
    expect(await next()).toBe(750);
    expect(await next()).toBe(1500);
    down.tip = false;
    expect(await next()).toBe(3000);
    await vi.waitFor(() => {
      expect(pending().map(({ ms }) => ms)).toEqual([POLL_MS]);
    });
    // The tip read, then a catch-up that fails: the cursor did not move; the backoff goes on from where it was.
    height = 7005;
    down.catchUp = true;
    expect(await next()).toBe(POLL_MS);
    await vi.waitFor(() => {
      expect(pending().map(({ ms }) => ms)).toEqual([750]);
    });
    expect(heights()).toEqual([]);
    down.catchUp = false;
    expect(await next()).toBe(750);
    await vi.waitFor(() => {
      expect(heights()).toEqual([7001, 7005]);
    });
    expect(catchUp.mock.calls.map(([after]) => after)).toEqual([{ height: 7000 }, { height: 7000 }]);
    expect(log).toHaveBeenCalledTimes(4);
    // A round that worked reset the backoff: the next failure waits a second's jitter again.
    down.tip = true;
    expect(await next()).toBe(POLL_MS);
    await vi.waitFor(() => {
      expect(pending().map(({ ms }) => ms)).toEqual([750]);
    });
  });

  it("keeps what its first pages gave when a later one fails: the next round goes on after them", async () => {
    let fail = true;
    let asked = 0;
    const catchUp = vi.fn<PollOptions["catchUp"]>(() =>
      ++asked === 1
        ? Promise.resolve(page([tx(7001, "a")], { more: true }))
        : fail
          ? Promise.reject(new Error("down"))
          : Promise.resolve(page([tx(7002, "b")])),
    );
    const { next, heights, log } = setup({ tip: tipsOf([7000, 7002]), catchUp });
    await next();
    await vi.waitFor(() => {
      expect(log).toHaveBeenCalledWith("chain_poll_failed");
    });
    expect(heights()).toEqual([7001]);
    fail = false;
    await next();
    await vi.waitFor(() => {
      expect(heights()).toEqual([7001, 7002]);
    });
    expect(catchUp.mock.calls.at(-1)?.[0]).toEqual({ height: 7001, index: 0 });
  });
});

describe("a stop", () => {
  it("cancels the timer that waits for the next round, and no round starts", async () => {
    const tip = vi.fn(() => Promise.resolve(7000));
    const { poll, pending, timers } = setup({ tip });
    await vi.waitFor(() => {
      expect(pending()).toHaveLength(1);
    });
    poll.stop();
    expect(timers.filter(({ live }) => live)).toEqual([]);
    expect(tip).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["the tip", "tip"],
    ["the catch-up", "catchUp"],
  ])(
    "aborts a round that is asking %s: nothing is delivered after it, no timer is armed (F5886)",
    async (_, asking) => {
      const answer = Promise.withResolvers<never>();
      const hang = asking === "tip" ? { tip: () => answer.promise } : { catchUp: () => answer.promise };
      const { poll, delivered, timers, next } = setup({
        tip: tipsOf([7000, 7001]),
        ...hang,
      });
      if (asking === "catchUp") {
        await next();
        await vi.waitFor(() => {
          expect(delivered).toHaveLength(1);
        });
      }
      const before = delivered.length;
      poll.stop();
      expect(timers.filter(({ live }) => live)).toEqual([]);
      answer.resolve(asking === "tip" ? (7001 as never) : (page([tx(7001, "a")]) as never));
      await new Promise((resolve) => setImmediate(resolve));
      expect(delivered).toHaveLength(before);
      expect(timers.filter(({ live }) => live)).toEqual([]);
    },
  );

  it("aborts the signal of the round in flight, which a request through send ends", () => {
    let seen: AbortSignal | undefined;
    const { poll } = setup({
      tip: (signal) => {
        seen = signal;
        return new Promise<number>(() => undefined);
      },
    });
    expect(seen?.aborted).toBe(false);
    poll.stop();
    expect(seen?.aborted).toBe(true);
  });

  it("does not abort the signal of a round that ended", async () => {
    let seen: AbortSignal | undefined;
    const { poll, pending } = setup({
      tip: (signal) => {
        seen = signal;
        return Promise.resolve(7000);
      },
    });
    await vi.waitFor(() => {
      expect(pending()).toHaveLength(1);
    });
    poll.stop();
    expect(seen?.aborted).toBe(false);
  });

  it("is a stop of a failing round too: no backoff timer is armed after it", async () => {
    const answer = Promise.withResolvers<number>();
    const { poll, timers } = setup({ tip: () => answer.promise });
    poll.stop();
    answer.reject(new Error("down"));
    await new Promise((resolve) => setImmediate(resolve));
    expect(timers.filter(({ live }) => live)).toEqual([]);
  });
});

describe("the poll with the real readers and a fake indexer", () => {
  const WATCH = new Map([[ACCESS, { world: "access" }]]);
  function rig(
    rows: () => FakeRow[],
    tip: () => number,
    send?: (query: string, init: RequestInit) => Promise<Response>,
  ) {
    const queries: string[] = [];
    const log = vi.fn<(what: string) => void>();
    const readers = indexerReaders({
      url: "https://indexer.example.test/graphql/query",
      watch: WATCH,
      log,
      send: (_, init) => {
        const query = queryOf(init);
        queries.push(query);
        return send?.(query, init) ?? Promise.resolve(answerOf({ tip, rows }, query));
      },
    });
    const run = setup({
      tip: (signal) => readers.tip(signal),
      catchUp: (after, upTo, signal) => readers.catchUp(after, upTo, signal),
      log,
      from: tip(),
    });
    return { ...run, queries, log };
  }
  const fat = (height: number, index: number, size: number): FakeRow => ({
    height,
    index,
    row: { ...txRow(height, `f${String(height)}-${String(index)}`, index), memo: "x".repeat(size) },
  });

  it("asks one request a round on a quiet chain, two when the tip moved, and reads a deployed block once (F5887)", async () => {
    const deploy = {
      ...txRow(101, "d"),
      messages: [{ value: { __typename: "MsgAddPackage", creator: "g1abc", package: { path: "gno.land/r/g1abc/x" } } }],
    };
    let tip = 100;
    const rows: FakeRow[] = [{ height: 101, index: 0, row: deploy }];
    const { next, queries, tips } = rig(
      () => rows,
      () => tip,
    );
    await vi.waitFor(() => {
      expect(tips()).toHaveLength(1);
    });
    expect(queries).toHaveLength(1);
    await next();
    await vi.waitFor(() => {
      expect(tips()).toHaveLength(2);
    });
    expect(queries).toHaveLength(2);
    tip = 101;
    await next();
    await vi.waitFor(() => {
      expect(tips()).toHaveLength(3);
    });
    expect(queries.slice(2).map((each) => each.slice(0, 30))).toEqual([
      "{ latestBlockHeight }",
      expect.stringContaining("getTransactions"),
      expect.stringContaining("getBlocks"),
    ]);
    const before = queries.length;
    tip = 102;
    await next();
    await next();
    await vi.waitFor(() => {
      expect(tips()).toHaveLength(5);
    });
    expect(queries.length - before).toBe(3);
    expect(queries.slice(before).filter((each) => each.includes("getBlocks"))).toEqual([]);
  });

  it("halves a page past the size cap and moves on, every row once and in order (F5885)", async () => {
    const rows = Array.from({ length: 40 }, (_, n) => fat(101, n, 36_000));
    let tip = 100;
    const { next, delivered, tips, log } = rig(
      () => rows,
      () => tip,
    );
    tip = 101;
    await next();
    for (let round = 0; round < 12 && delivered.filter((read) => read.hash !== undefined).length < 40; round += 1) {
      await vi.waitFor(() => {
        expect(tips().length).toBeGreaterThan(round);
      });
      await next();
    }
    expect(delivered.flatMap((read) => (read.hash === undefined ? [] : [read.hash]))).toEqual(
      rows.map(({ row }) => row["hash"]),
    );
    expect(log).toHaveBeenCalledWith("chain_catch_up_page_halved");
    expect(MAX_BYTES).toBe(1_000_000);
  });

  it("passes a row too big on its own, said, and delivers the ones around it (F5885)", async () => {
    const rows = [fat(101, 0, 10), fat(101, 1, MAX_BYTES + 10), fat(101, 2, 10)];
    let tip = 100;
    const { next, delivered, tips, log } = rig(
      () => rows,
      () => tip,
    );
    tip = 101;
    for (let round = 0; round < 3; round += 1) await next();
    await vi.waitFor(() => {
      expect(tips()).toHaveLength(4);
    });
    expect(delivered.flatMap((read) => (read.hash === undefined ? [] : [read.hash]))).toEqual(["f101-0", "f101-2"]);
    expect(log).toHaveBeenCalledWith("chain_catch_up_row_skipped");
  });

  it("aborts a request in flight at a stop, and asks and delivers nothing after (F5886)", async () => {
    let signal: AbortSignal | undefined;
    let asked = 0;
    const { poll, delivered, timers } = rig(
      () => [],
      () => 100,
      (_, init) => {
        asked += 1;
        if (asked === 1) return Promise.resolve(answerOf({ tip: () => 100, rows: () => [] }, "{ latestBlockHeight }"));
        signal = init.signal ?? undefined;
        return new Promise<Response>((_, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        });
      },
    );
    await vi.waitFor(() => {
      expect(timers.some(({ live }) => live)).toBe(true);
    });
    const waiting = timers.find(({ live }) => live);
    waiting?.run();
    await vi.waitFor(() => {
      expect(signal).toBeDefined();
    });
    expect(signal?.aborted).toBe(false);
    poll.stop();
    expect(signal?.aborted).toBe(true);
    await new Promise((resolve) => setImmediate(resolve));
    expect(asked).toBe(2);
    expect(delivered).toHaveLength(1);
  });
});

describe("what the poll holds", () => {
  const manyTx = (from: number, count: number) =>
    Array.from({ length: count }, (_, n) => tx(from + n, `h${String(from + n)}`));

  it("keeps the hashes of its last 10,000 transactions: an old one may come again, the last one never", async () => {
    const answers = [page(manyTx(0, SEEN + 5)), page([tx(SEEN + 4, `h${String(SEEN + 4)}`), tx(0, "h0")])];
    const { next, heights } = setup({
      tip: tipsOf([SEEN + 5, SEEN + 6]),
      catchUp: () => Promise.resolve(answers.shift() ?? page([])),
      from: 0,
    });
    await vi.waitFor(
      () => {
        expect(heights()).toHaveLength(SEEN + 5);
      },
      { timeout: 20_000 },
    );
    await next();
    await vi.waitFor(
      () => {
        expect(heights()).toHaveLength(SEEN + 6);
      },
      { timeout: 20_000 },
    );
    expect(heights().at(-1)).toBe(0);
  }, 30_000);

  it("are 10,000: the oldest of exactly that many is still known, and goes with the next one", async () => {
    const answers = [page([...manyTx(0, SEEN), tx(0, "h0")]), page([tx(SEEN, `h${String(SEEN)}`), tx(0, "h0")])];
    const { next, heights } = setup({
      tip: tipsOf([SEEN, SEEN + 1]),
      catchUp: () => Promise.resolve(answers.shift() ?? page([])),
      from: 0,
    });
    await vi.waitFor(
      () => {
        expect(heights()).toHaveLength(SEEN);
      },
      { timeout: 20_000 },
    );
    await next();
    await vi.waitFor(
      () => {
        expect(heights()).toHaveLength(SEEN + 2);
      },
      { timeout: 20_000 },
    );
  }, 30_000);
});

describe("the default timer", () => {
  it("runs after its time, and not at all once the function it gave is called", () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn();
      const cancelled = vi.fn();
      timer(100, run);
      timer(100, cancelled)();
      vi.advanceTimersByTime(99);
      expect(run).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(run).toHaveBeenCalledTimes(1);
      expect(cancelled).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
