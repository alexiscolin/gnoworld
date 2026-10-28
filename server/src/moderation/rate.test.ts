import { afterEach, describe, expect, it, vi } from "vitest";
import { lineRate } from "./rate.ts";

const MINUTE = 60_000;

afterEach(() => {
  vi.useRealTimers();
});

describe("the lines an account sent in a minute", () => {
  it("forgets the account touched longest ago once 10,000 are held, never by time", () => {
    const rate = lineRate();
    for (let n = 0; n < 10_000; n += 1) rate.add(`account${String(n)}`, { id: `m${String(n)}`, at: 0, lines: 60 });
    // An hour later by Ergo's clock: nobody is forgotten for it, only the count counts.
    rate.add("account0", { id: "late", at: 3_600_000, lines: 1 });
    expect(rate.held()).toBe(10_001);
    rate.add("newcomer", { id: "new", at: 3_600_000, lines: 1 });
    // 10,001 accounts: account1, touched longest ago, is forgotten (account0 was touched again) and holds nothing.
    expect(rate.held()).toBe(10_001);
    expect(rate.add("account2", { id: "again2", at: 1, lines: 60 })).toBe(true);
    expect(rate.add("account1", { id: "again1", at: 1, lines: 60 })).toBe(false);
  });

  it("keeps an account touched again when the oldest ones are forgotten", () => {
    const rate = lineRate();
    rate.add("kept", { id: "k1", at: 0, lines: 60 });
    for (let n = 0; n < 9_999; n += 1) rate.add(`account${String(n)}`, { id: `m${String(n)}`, at: 0, lines: 1 });
    rate.add("kept", { id: "k2", at: 1, lines: 1 });
    for (let n = 0; n < 5; n += 1) rate.add(`new${String(n)}`, { id: `n${String(n)}`, at: 2, lines: 1 });
    expect(rate.add("kept", { id: "k3", at: 3, lines: 40 })).toBe(true);
  });

  it("still counts an account's lines when a backlog serves them minutes apart, stamped within seconds (S1)", () => {
    const rate = lineRate();
    const sent = [];
    // Others' lines come between the flooder's turns, stamped a minute or more after it: Ergo's clock moves on.
    for (const [n, at] of [0, 1000, 2000].entries()) {
      rate.add(`other${String(n)}`, { id: `o${String(n)}`, at: n * 61_000, lines: 1 });
      sent.push(rate.add("flooder", { id: `m${String(n)}`, at, lines: 40 }));
    }
    expect(sent).toEqual([false, false, true]);
  });

  it("counts an account's lines whatever the server's own clock did between them, only Ergo's stamps counting (R1)", () => {
    // S1 as reported forgot an account 60 s after the server last heard of it: the adds took no real time, so a test
    // of them alone never saw it. Here the server's clock jumps 61 s before every add.
    vi.useFakeTimers();
    const rate = lineRate();
    const sent = [];
    for (const [n, at] of [0, 1000, 2000].entries()) {
      vi.advanceTimersByTime(61_000);
      sent.push(rate.add("flooder", { id: `m${String(n)}`, at, lines: 40 }));
    }
    expect(sent).toEqual([false, false, true]);
    expect(rate.held()).toBe(3);
  });

  it("counts the lines of the minute before a message by Ergo's stamps, not by when they arrived", () => {
    const rate = lineRate();
    rate.add("a", { id: "m1", at: 0, lines: 100 });
    expect(rate.add("a", { id: "m2", at: 59_999, lines: 1 })).toBe(true);
    expect(rate.add("a", { id: "m3", at: 60_001, lines: 1 })).toBe(false);
    expect(rate.add("b", { id: "m4", at: 0, lines: 100 })).toBe(false);
    expect(rate.add("b", { id: "m5", at: 60_000, lines: 1 })).toBe(false);
  });

  it("holds an account's flood in 101 messages at most, which are over the limit already", () => {
    const rate = lineRate();
    let over = false;
    for (let n = 0; n < 1000; n += 1) over = rate.add("flood", { id: `m${String(n)}`, at: n, lines: 1 });
    expect(rate.held()).toBe(101);
    expect(over).toBe(true);
  });

  it("says whether the account is past 100 lines in the minute before the message, itself counted", () => {
    const rate = lineRate();
    expect(rate.add("a", { id: "m1", at: 0, lines: 100 })).toBe(false);
    expect(rate.add("a", { id: "m2", at: 1, lines: 1 })).toBe(true);
    expect(rate.add("a", { id: "m3", at: MINUTE, lines: 1 })).toBe(false);
  });

  it("leaves out of a minute the messages stamped after it, which arrived before", () => {
    const rate = lineRate();
    rate.add("a", { id: "m1", at: 1000, lines: 100 });
    expect(rate.add("a", { id: "m2", at: 0, lines: 1 })).toBe(false);
  });

  it("counts a message once, by its id", () => {
    const rate = lineRate();
    rate.add("a", { id: "m1", at: 0, lines: 60 });
    expect(rate.add("a", { id: "m1", at: 0, lines: 60 })).toBe(false);
    expect(rate.held()).toBe(1);
  });
});
