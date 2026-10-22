import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../log.ts";
import { makeQueue } from "./queue.ts";

interface Item {
  account: string;
  n: number;
}

afterEach(() => {
  vi.useRealTimers();
});

const setup = (options: { cap?: number; perAccount?: number; concurrency?: number } = {}, fail = false) => {
  const ran: Item[] = [];
  const gates: (() => void)[] = [];
  let running = 0;
  let most = 0;
  const lines: string[] = [];
  const clock = { now: 0 };
  const queue = makeQueue<Item>({
    run: async (item) => {
      running += 1;
      most = Math.max(most, running);
      await new Promise<void>((resolve) => gates.push(resolve));
      running -= 1;
      ran.push(item);
      if (fail) throw new Error(`a check failed on ${item.account}`);
    },
    log: logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line)),
    now: () => clock.now,
    ...options,
  });
  const open = async (): Promise<void> => {
    while (gates.length > 0) {
      for (const release of gates.splice(0)) release();
      await new Promise((resolve) => setImmediate(resolve));
    }
  };
  return { queue, ran, gates, lines, clock, open, most: () => most };
};

describe("the check's queue", () => {
  it("runs at most four checks at once, by default", async () => {
    const { queue, open, most, ran } = setup();
    for (let n = 0; n < 10; n += 1) queue.push({ account: `a${String(n)}`, n });
    await open();
    expect([most(), ran.length, queue.size()]).toEqual([4, 10, 0]);
  });

  // Counted from the line running when the other arrives: then one turn of the flood at most.
  it("takes accounts in turn: one account's 1,000 lines hold back another's line by one turn at most", async () => {
    const { queue, open, ran } = setup({ concurrency: 1, perAccount: 1000 });
    for (let n = 0; n < 1000; n += 1) queue.push({ account: "flood", n });
    queue.push({ account: "someone", n: 0 });
    await open();
    expect(ran.findIndex(({ account }) => account === "someone")).toBeLessThanOrEqual(2);
    expect(ran).toHaveLength(1001);
  });

  // The cap counts the lines waiting: one runs at once here, three wait.
  it("refuses a line past its cap, and raises the alert", () => {
    const { queue, lines } = setup({ cap: 3, perAccount: 3, concurrency: 1 });
    expect([0, 1, 2, 3, 4].map((n) => queue.push({ account: "a", n }))).toEqual([true, true, true, true, false]);
    expect(
      lines.filter((line) => line.includes('"event":"alert"') && line.includes('"moderation_queue_full"')),
    ).toHaveLength(1);
  });

  it("logs its oldest waiting line's age every 30 seconds, and raises the alert at two minutes, at each tick past", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { queue, lines, clock, gates } = setup({ concurrency: 1 });
    queue.push({ account: "a", n: 0 });
    clock.now = 1;
    queue.push({ account: "a", n: 1 });
    clock.now = 20_000;
    queue.push({ account: "b", n: 2 });
    for (const at of [30_000, 60_000, 90_000, 120_000, 120_001, 150_001]) {
      clock.now = at;
      vi.advanceTimersByTime(at === 120_001 ? 0 : 30_000);
    }
    const backlog = lines.filter((line) => line.includes('"event":"moderation_backlog"'));
    expect(backlog.map((line) => /"ms":(\d+)/.exec(line)?.[1])).toEqual([
      "29999",
      "59999",
      "89999",
      "119999",
      "150000",
    ]);
    expect(lines.filter((line) => line.includes('"event":"alert"'))).toHaveLength(1);
    for (const release of gates.splice(0)) release();
    queue.stop();
  });

  it("logs nothing while empty, nor once its lines have run, and nothing more once stopped", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { queue, lines, open } = setup();
    vi.advanceTimersByTime(90_000);
    queue.push({ account: "a", n: 0 });
    await open();
    vi.advanceTimersByTime(90_000);
    queue.push({ account: "a", n: 1 });
    queue.stop();
    vi.advanceTimersByTime(90_000);
    expect(lines.filter((line) => line.includes("moderation_backlog"))).toEqual([]);
  });

  it("holds each account to its share of the cap: a flood is refused, another account still gets in", () => {
    const { queue, lines } = setup({ cap: 10, perAccount: 3, concurrency: 1 });
    expect([0, 1, 2, 3, 4].map((n) => queue.push({ account: "flood", n }))).toEqual([true, true, true, true, false]);
    expect(queue.push({ account: "other", n: 0 })).toBe(true);
    expect(lines.filter((line) => line.includes('"moderation_account_full"'))).toHaveLength(1);
  });

  it("takes three accounts in turn: two floods hold a third account's line back by one turn each at most", async () => {
    const { queue, open, ran } = setup({ concurrency: 1 });
    for (let n = 0; n < 50; n += 1) {
      queue.push({ account: "a", n });
      queue.push({ account: "b", n });
    }
    queue.push({ account: "c", n: 0 });
    await open();
    expect(ran.findIndex(({ account }) => account === "c")).toBeLessThanOrEqual(3);
  });

  it("frees a check's place when it fails, logs the failure without the line, and runs the rest", async () => {
    const { queue, open, ran, lines } = setup({ concurrency: 4 }, true);
    for (let n = 0; n < 6; n += 1) queue.push({ account: `a${String(n)}`, n });
    await open();
    await queue.idle();
    expect([ran.length, queue.size()]).toEqual([6, 0]);
    const failed = lines.filter((line) => line.includes('"moderation_failed"'));
    expect(failed).toHaveLength(6);
    expect(failed.join("")).not.toContain("a check failed");
    queue.stop();
  });

  it("says when it is idle: nothing waiting, nothing running", async () => {
    const { queue, gates } = setup({ concurrency: 1 });
    await queue.idle();
    queue.push({ account: "a", n: 0 });
    let idle = false;
    const waited = queue.idle().then(() => (idle = true));
    await new Promise((resolve) => setImmediate(resolve));
    expect(idle).toBe(false);
    for (const release of gates.splice(0)) release();
    await waited;
    expect([idle, queue.size()]).toEqual([true, 0]);
  });

  it("holds nothing once 10,000 lines have run", async () => {
    const { queue, open, ran } = setup();
    for (let n = 0; n < 10_000; n += 1) queue.push({ account: `a${String(n % 100)}`, n });
    await open();
    expect([ran.length, queue.size()]).toEqual([10_000, 0]);
    queue.stop();
  });
});
