import { describe, expect, it } from "vitest";
import { lineRate } from "./rate.ts";

const MINUTE = 60_000;

describe("the lines an account sent in a minute", () => {
  it("forgets the accounts not seen for a minute, however many there were", () => {
    const clock = { now: 0 };
    const rate = lineRate(() => clock.now);
    for (let n = 0; n < 5000; n += 1) rate.add(`account${String(n)}`, { id: `m${String(n)}`, at: 0, lines: 1 });
    expect(rate.held()).toBe(5000);
    clock.now = MINUTE;
    rate.add("another", { id: "m-another", at: 0, lines: 1 });
    expect(rate.held()).toBe(1);
  });

  it("keeps an account seen again within the minute, and forgets one a minute old", () => {
    const clock = { now: 0 };
    const rate = lineRate(() => clock.now);
    rate.add("kept", { id: "m2", at: 0, lines: 1 });
    rate.add("gone", { id: "m1", at: 0, lines: 1 });
    clock.now = MINUTE / 2;
    rate.add("kept", { id: "m3", at: 0, lines: 1 });
    clock.now = MINUTE;
    rate.add("probe", { id: "m4", at: 0, lines: 1 });
    expect(rate.held()).toBe(3);
  });

  it("holds an account's flood in 101 messages at most, which are over the limit already", () => {
    const rate = lineRate(() => 0);
    let over = false;
    for (let n = 0; n < 1000; n += 1) over = rate.add("flood", { id: `m${String(n)}`, at: n, lines: 1 });
    expect(rate.held()).toBe(101);
    expect(over).toBe(true);
  });

  it("says whether the account is past 100 lines in the minute before the message, itself counted", () => {
    const rate = lineRate(() => 0);
    expect(rate.add("a", { id: "m1", at: 0, lines: 100 })).toBe(false);
    expect(rate.add("a", { id: "m2", at: 1, lines: 1 })).toBe(true);
    expect(rate.add("a", { id: "m3", at: MINUTE, lines: 1 })).toBe(false);
  });

  it("leaves out of a minute the messages stamped after it, which arrived before", () => {
    const rate = lineRate(() => 0);
    rate.add("a", { id: "m1", at: 1000, lines: 100 });
    expect(rate.add("a", { id: "m2", at: 0, lines: 1 })).toBe(false);
  });

  it("counts a message once, by its id", () => {
    const rate = lineRate(() => 0);
    rate.add("a", { id: "m1", at: 0, lines: 60 });
    expect(rate.add("a", { id: "m1", at: 0, lines: 60 })).toBe(false);
    expect(rate.held()).toBe(1);
  });
});
