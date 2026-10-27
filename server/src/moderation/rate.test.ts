import { describe, expect, it } from "vitest";
import { lineRate } from "./rate.ts";

const MINUTE = 60_000;

describe("the lines an account sent in a minute", () => {
  it("forgets the accounts whose newest line is a minute behind Ergo's clock, however many there were", () => {
    const rate = lineRate();
    for (let n = 0; n < 5000; n += 1) rate.add(`account${String(n)}`, { id: `m${String(n)}`, at: 0, lines: 1 });
    expect(rate.held()).toBe(5000);
    rate.add("another", { id: "m-another", at: MINUTE, lines: 1 });
    expect(rate.held()).toBe(1);
  });

  it("keeps an account whose newest line is within the minute, and forgets one a minute old", () => {
    const rate = lineRate();
    rate.add("kept", { id: "m2", at: 0, lines: 1 });
    rate.add("gone", { id: "m1", at: 0, lines: 1 });
    rate.add("kept", { id: "m3", at: MINUTE / 2, lines: 1 });
    rate.add("probe", { id: "m4", at: MINUTE, lines: 1 });
    expect(rate.held()).toBe(3);
  });

  it("still counts an account's lines when a backlog serves them minutes apart, stamped within seconds (S1)", () => {
    const rate = lineRate();
    const sent = [];
    for (const [n, at] of [0, 1000, 2000].entries()) {
      rate.add(`other${String(n)}`, { id: `o${String(n)}`, at, lines: 1 });
      sent.push(rate.add("flooder", { id: `m${String(n)}`, at, lines: 40 }));
    }
    expect(sent).toEqual([false, false, true]);
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
