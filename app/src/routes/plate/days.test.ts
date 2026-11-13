import { afterEach, describe, expect, it, vi } from "vitest";
import { dayLabel, dayValues } from "./days.ts";

// A rollup's days as a chart's: every UTC day from the first with a call to today's, words as the chain's days.
afterEach(() => {
  vi.useRealTimers();
});

describe("a rollup's days", () => {
  it("fills every UTC day from the first call to the moment's day, none counted as zero", () => {
    const days = [
      { day: "2026-09-30", calls: 2, callers: 1 },
      { day: "2026-10-02", calls: 1, callers: 1 },
    ];
    expect(dayValues(days, "2026-10-03T23:59:00.000Z")).toEqual([
      { day: "2026-09-30", calls: 2, callers: 1 },
      { day: "2026-10-01", calls: 0, callers: 0 },
      { day: "2026-10-02", calls: 1, callers: 1 },
      { day: "2026-10-03", calls: 0, callers: 0 },
    ]);
  });

  it("words a day as the chain's, its year only when it is not this one", () => {
    vi.useFakeTimers({ now: Date.parse("2026-11-13T12:00:00.000Z"), toFake: ["Date"] });
    expect(dayLabel("2026-10-03")).toBe("3 Oct");
    expect(dayLabel("2025-10-03")).toBe("3 Oct 2025");
  });
});
