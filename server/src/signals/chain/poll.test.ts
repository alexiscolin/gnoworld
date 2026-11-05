import { describe, expect, it, vi } from "vitest";
import { blocks, call, registration } from "../../testing/chainRecorded.ts";
import type { ChainRead } from "./message.ts";
import { CATCH_UP_MS, pollChain, POLL_MS, SEEN, timer, type PollOptions } from "./poll.ts";

// Slice 9g: the one poll of a universe's public indexer, once a block (answer 9g-4, by Alexis). Every test drives a fake clock
// (a timer runs when the test fires it, never by itself) and fake reads, and waits on the poll's own events, never on time.

// A transaction at a height, as a recorded frame with its height and hash changed.
function tx(height: number, hash: string): string {
  const frame: unknown = JSON.parse(call);
  const t = (frame as { payload: { data: { getTransactions: Record<string, unknown> } } }).payload.data.getTransactions;
  t["block_height"] = height;
  t["hash"] = hash;
  return JSON.stringify(frame);
}

function setup(over: Partial<PollOptions> = {}) {
  const delivered: ChainRead[] = [];
  const log = vi.fn<PollOptions["log"]>();
  const timers: { ms: number; run: () => void; live: boolean }[] = [];
  const options: PollOptions = {
    universe: "onyx",
    watch: new Map([["gno.land/r/g14wv9hyngyrzpxn3ztvnx2jygs50m0240qncm8j/access", { world: "access" }]]),
    tip: () => Promise.resolve(7000),
    catchUp: () => Promise.resolve([]),
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
  /** The timers waiting for their time, the round's own limit apart. */
  const pending = () => timers.filter(({ ms, live }) => live && ms !== CATCH_UP_MS);
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
    const catchUp = vi.fn(() => Promise.resolve<string[]>([]));
    const { next, tips } = setup({ catchUp });
    await next();
    await vi.waitFor(() => {
      expect(tips()).toEqual([7000, 7000]);
    });
    expect(catchUp).not.toHaveBeenCalled();
  });

  it("starts at the height the history read reached, and reads nothing from before it", async () => {
    const catchUp = vi.fn<PollOptions["catchUp"]>(() => Promise.resolve<string[]>([]));
    setup({ from: 6990, catchUp });
    await vi.waitFor(() => {
      expect(catchUp).toHaveBeenCalledWith(6990);
    });
    expect(catchUp.mock.calls.every(([from]) => from >= 6990)).toBe(true);
  });

  it("catches up from the cursor when the tip moved, with no gap and no double across rounds", async () => {
    const heightsOf = [7000, 7003, 7004];
    let round = 0;
    const answers = [
      [tx(7001, "a"), tx(7002, "b"), tx(7003, "c")],
      [tx(7003, "c"), tx(7004, "d")],
    ];
    const catchUp = vi.fn<PollOptions["catchUp"]>(() => Promise.resolve(answers[round - 2] ?? []));
    const { next, heights } = setup({
      tip: () => Promise.resolve(heightsOf[round++] ?? 7004),
      catchUp,
    });
    await next();
    await vi.waitFor(() => {
      expect(heights()).toEqual([7001, 7002, 7003]);
    });
    await next();
    await vi.waitFor(() => {
      expect(heights()).toEqual([7001, 7002, 7003, 7004]);
    });
    // The block the cursor stood on is read again (nothing may fall between two rounds); its transaction is given once.
    expect(catchUp.mock.calls).toEqual([[7000], [7003]]);
  });

  it("asks no catch-up while the tip has not moved, and tells the tip all the same", async () => {
    const catchUp = vi.fn(() => Promise.resolve<string[]>([]));
    const { next, tips } = setup({ catchUp });
    await next();
    await next();
    await vi.waitFor(() => {
      expect(tips()).toEqual([7000, 7000, 7000]);
    });
    expect(catchUp).not.toHaveBeenCalled();
  });

  it("tells the tip after the round's reads, so the count is told once the deploys are counted", async () => {
    let round = 0;
    const { next, delivered } = setup({
      tip: () => Promise.resolve([7000, 7002][round++] ?? 7002),
      catchUp: () => Promise.resolve([tx(7001, "a"), tx(7002, "b")]),
    });
    await next();
    await vi.waitFor(() => {
      expect(delivered).toHaveLength(4);
    });
    expect(delivered.map((read) => read.tip ?? read.height)).toEqual([7000, 7001, 7002, 7002]);
    expect(delivered[3]).toEqual({ events: [], tip: 7002 });
  });

  it("moves its cursor by the transactions it read, not by the tip: the next catch-up starts at the last one", async () => {
    let round = 0;
    const catchUp = vi.fn<PollOptions["catchUp"]>(() => Promise.resolve(round === 2 ? [tx(7003, "a")] : []));
    const { next, tips } = setup({ tip: () => Promise.resolve([7000, 7005, 7009][round++] ?? 7009), catchUp });
    await next();
    await vi.waitFor(() => {
      expect(tips()).toHaveLength(2);
    });
    await next();
    await vi.waitFor(() => {
      expect(catchUp).toHaveBeenCalledTimes(2);
    });
    expect(catchUp.mock.calls.map(([from]) => from)).toEqual([7000, 7003]);
  });

  it("leaves its cursor where it is for a text that tells no height", async () => {
    let round = 0;
    const catchUp = vi.fn<PollOptions["catchUp"]>(() =>
      Promise.resolve(round === 2 ? ["not json", "not json either"] : []),
    );
    const { next, delivered, tips } = setup({
      tip: () => Promise.resolve([7000, 7005, 7009][round++] ?? 7009),
      catchUp,
    });
    await next();
    await vi.waitFor(() => {
      expect(tips()).toHaveLength(2);
    });
    // Both said texts were delivered as reads of no event, and the next catch-up still starts at the tip the last one reached.
    expect(delivered.filter((read) => read.tip === undefined)).toHaveLength(2);
    await next();
    await vi.waitFor(() => {
      expect(catchUp).toHaveBeenCalledTimes(2);
    });
    expect(catchUp.mock.calls.map(([from]) => from)).toEqual([7000, 7005]);
  });

  it("delivers every block's frame: a block has no hash to read it once by", async () => {
    let round = 0;
    const { next, delivered, tips } = setup({
      tip: () => Promise.resolve([7000, 7005][round++] ?? 7005),
      catchUp: () => Promise.resolve([blocks[0] ?? "", blocks[1] ?? ""]),
    });
    await next();
    await vi.waitFor(() => {
      expect(tips()).toHaveLength(2);
    });
    expect(delivered.flatMap((read) => (read.block === undefined ? [] : [read.block.height]))).toEqual([
      908297, 908298,
    ]);
  });

  it("takes a block's height as read too: the next catch-up starts from it", async () => {
    let round = 0;
    const catchUp = vi.fn<PollOptions["catchUp"]>(() =>
      Promise.resolve<string[]>(round === 2 ? [blocks[1] ?? ""] : []),
    );
    const { next, tips } = setup({ tip: () => Promise.resolve([908290, 908299, 908300][round++] ?? 908300), catchUp });
    await next();
    await vi.waitFor(() => {
      expect(tips()).toHaveLength(2);
    });
    await next();
    await vi.waitFor(() => {
      expect(catchUp).toHaveBeenCalledWith(908298);
    });
  });

  it("gives a text of no watched realm as no event, and says nothing of it", async () => {
    let round = 0;
    const { next, delivered, log } = setup({
      tip: () => Promise.resolve([7000, 7001][round++] ?? 7001),
      catchUp: () => Promise.resolve([registration(0)]),
    });
    await next();
    await vi.waitFor(() => {
      expect(delivered).toHaveLength(3);
    });
    expect(delivered[1]?.events).toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });

  it("says a text that fails its schema, and goes on", async () => {
    let round = 0;
    const { next, delivered, log } = setup({
      tip: () => Promise.resolve([7000, 7001][round++] ?? 7001),
      catchUp: () => Promise.resolve(["not json", tx(7001, "a")]),
    });
    await next();
    await vi.waitFor(() => {
      expect(delivered).toHaveLength(4);
    });
    expect(log).toHaveBeenCalledWith("chain_message_bad");
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

  it("is ended at its time limit, said, and a retry waits the backoff; its late answer changes nothing", async () => {
    const late = Promise.withResolvers<number>();
    let round = 0;
    const catchUp = vi.fn(() => Promise.resolve<string[]>([tx(7001, "a")]));
    const { timers, pending, log, delivered } = setup({
      tip: () => (round++ === 0 ? late.promise : Promise.resolve(7001)),
      catchUp,
    });
    const limit = timers.find(({ ms }) => ms === CATCH_UP_MS);
    expect(CATCH_UP_MS).toBe(30_000);
    limit?.run();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("chain_poll_failed");
    expect(pending().map(({ ms }) => ms)).toEqual([750]);
    late.resolve(9999);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(delivered).toEqual([]);
    expect(pending().map(({ ms }) => ms)).toEqual([750]);
    expect(log).toHaveBeenCalledTimes(1);
    expect(catchUp).not.toHaveBeenCalled();
  });

  it.each([
    ["answers", () => Promise.resolve(7000)],
    ["fails", () => Promise.reject(new Error("down"))],
  ])("has its time limit cancelled once the tip %s", async (_, tip) => {
    const { timers, pending } = setup({ tip });
    await vi.waitFor(() => {
      expect(pending()).toHaveLength(1);
    });
    expect(timers.filter(({ ms }) => ms === CATCH_UP_MS).map(({ live }) => live)).toEqual([false]);
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
      down.catchUp ? Promise.reject(new Error("down")) : Promise.resolve([tx(7001, "a"), tx(7005, "b")]),
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
    expect(catchUp.mock.calls.map(([from]) => from)).toEqual([7000, 7000]);
    expect(log).toHaveBeenCalledTimes(4);
    // A round that worked reset the backoff: the next failure waits a second's jitter again.
    down.tip = true;
    expect(await next()).toBe(POLL_MS);
    await vi.waitFor(() => {
      expect(pending().map(({ ms }) => ms)).toEqual([750]);
    });
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
  ])("ends a round that is asking %s: nothing is delivered after it, no timer is armed", async (_, asking) => {
    const answer = Promise.withResolvers<never>();
    const hang = asking === "tip" ? { tip: () => answer.promise } : { catchUp: () => answer.promise };
    let round = 0;
    const { poll, delivered, timers, next } = setup({
      tip: () => Promise.resolve([7000, 7001][round++] ?? 7001),
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
    answer.resolve(asking === "tip" ? (7001 as never) : ([tx(7001, "a")] as never));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(delivered).toHaveLength(before);
    expect(timers.filter(({ live }) => live)).toEqual([]);
  });

  it("is a stop of a failing round too: no backoff timer is armed after it", async () => {
    const answer = Promise.withResolvers<number>();
    const { poll, timers } = setup({ tip: () => answer.promise });
    poll.stop();
    answer.reject(new Error("down"));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(timers.filter(({ live }) => live)).toEqual([]);
  });
});

describe("what the poll holds", () => {
  const manyTx = (from: number, count: number): string[] =>
    Array.from({ length: count }, (_, n) => tx(from + n, `h${String(from + n)}`));

  it("keeps the hashes of its last 10,000 transactions: an old one may come again, the last one never", async () => {
    let round = 0;
    const answers = [manyTx(0, SEEN + 5), [tx(SEEN + 4, `h${String(SEEN + 4)}`), tx(0, "h0")]];
    const { next, heights } = setup({
      tip: () => Promise.resolve([1, SEEN + 5, SEEN + 6][round++] ?? SEEN + 6),
      catchUp: () => Promise.resolve(answers[round - 1] ?? []),
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
    let round = 0;
    const answers = [
      [...manyTx(0, SEEN), tx(0, "h0")],
      [tx(SEEN, `h${String(SEEN)}`), tx(0, "h0")],
    ];
    const { next, heights } = setup({
      tip: () => Promise.resolve([1, SEEN, SEEN + 1][round++] ?? SEEN + 1),
      catchUp: () => Promise.resolve(answers[round - 1] ?? []),
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
