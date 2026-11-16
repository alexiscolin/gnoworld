import { describe, expect, it } from "vitest";
import { DATE_GAP, plotOf } from "./dayPlot.ts";

// The dates under the bars stand a date's room apart, whatever the chart's width and the days it holds.
describe("plotOf's dates", () => {
  it.each([
    [60, 350],
    [60, 520],
    [14, 300],
    [31, 380],
    [7, 200],
    [400, 440],
  ])("keeps %i days in %i px at least a date's room apart", (days, w) => {
    const { every, slot } = plotOf({ counts: Array.from({ length: days }, () => 1), scale: "log", w, h: 200 });
    expect(every * slot).toBeGreaterThanOrEqual(DATE_GAP);
  });
});
