import { afterEach, describe, expect, it, vi } from "vitest";
import { lineFetches } from "./fetch.ts";
import type { Said } from "./lines.ts";

// The surviving mutants of the day (slice 13): the questions' book, on its own.
const said = (msgid: string): Said => ({
  room: "#r",
  account: "g1someone",
  msgid,
  text: "hi",
  time: new Date(0).toISOString(),
});

afterEach(() => {
  vi.useRealTimers();
});

describe("lineFetches", () => {
  it("keeps a question asked again after one gave up: that one's late refusal does not cancel it", async () => {
    vi.useFakeTimers();
    const fetches = lineFetches(1000);
    const write = vi.fn();
    const first = fetches.ask(write, "#r", "m1");
    vi.advanceTimersByTime(1000);
    const second = fetches.ask(write, "#r", "m1");
    expect(write).toHaveBeenCalledTimes(2);
    fetches.failed(); // Ergo refuses the first request, the one that gave up
    expect(fetches.ask(write, "#r", "m1")).toBe(second);
    expect(write).toHaveBeenCalledTimes(2);
    expect(await first).toBe("unanswered");
  });

  it("hears a line or a close of a batch that is no question's without a fault", () => {
    const fetches = lineFetches(1000);
    expect(() => {
      fetches.line("unknown", said("m1"));
      fetches.line("unknown", undefined);
      fetches.closed("unknown");
    }).not.toThrow();
  });

  it("answers the line a question's batch held, and not another's", async () => {
    const fetches = lineFetches(1000);
    const found = fetches.ask(() => undefined, "#r", "m1");
    expect(fetches.opened("b1", "#r")).toBe(true);
    fetches.line("b1", said("other"));
    fetches.line("b1", said("m1"));
    fetches.closed("b1");
    expect(await found).toEqual(said("m1"));
  });
});
