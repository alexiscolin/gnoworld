import { describe, expect, it } from "vitest";
import { Pace } from "./pace.ts";

// F2092 (AP3): the page's mirror of the server's two rates, 20 messages and 100 lines an account a minute
// (server/src/moderation/check.ts, rate.ts); a message past either is hidden there and costs a strike.
const S = 1000;
const sendAll = (pace: Pace, count: number, at: number) => {
  for (let index = 0; index < count; index += 1) pace.record(at, 1, 1);
};

describe("Pace", () => {
  it("lets 20 messages in a minute go and refuses the 21st, saying when", () => {
    const pace = new Pace();
    sendAll(pace, 19, 0);
    expect(pace.slow(30 * S, 1, 1)).toBeUndefined();
    pace.record(30 * S, 1, 1);
    expect(pace.slow(40 * S, 1, 1)).toEqual({ limit: "messages", wait: 20 * S + 1 });
  });

  it("lets a message go once the first of the minute is older than it", () => {
    const pace = new Pace();
    sendAll(pace, 20, 0);
    expect(pace.slow(60 * S, 1, 1)).toBeUndefined();
    expect(pace.slow(60 * S - 1, 1, 1)).toEqual({ limit: "messages", wait: 2 });
  });

  it("counts each line of a message: 100 lines a minute, refusing the line that makes 101", () => {
    const pace = new Pace();
    pace.record(0, 1, 40);
    pace.record(10 * S, 1, 40);
    expect(pace.slow(20 * S, 1, 20)).toBeUndefined();
    expect(pace.slow(20 * S, 1, 21)).toEqual({ limit: "lines", wait: 40 * S + 1 });
  });

  it("waits for as many old messages as it takes to make room, not for all of them", () => {
    const pace = new Pace();
    pace.record(0, 1, 60);
    pace.record(10 * S, 1, 30);
    pace.record(20 * S, 1, 10);
    expect(pace.slow(30 * S, 1, 50)).toEqual({ limit: "lines", wait: 30 * S + 1 });
  });

  it("counts a message of several lines sent a line at a time as that many messages", () => {
    const pace = new Pace();
    pace.record(0, 19, 19);
    expect(pace.slow(S, 2, 2)).toEqual({ limit: "messages", wait: 59 * S + 1 });
    expect(pace.slow(S, 1, 1)).toBeUndefined();
  });

  it("holds no more than a minute of what was sent", () => {
    const pace = new Pace();
    for (let minute = 0; minute < 50; minute += 1) sendAll(pace, 20, minute * 60 * S);
    expect(pace.slow(50 * 60 * S, 1, 1)).toBeUndefined();
  });
});
