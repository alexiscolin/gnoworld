import { describe, expect, it } from "vitest";
import { DATE_GAP, LEFT, dateShown, plotOf } from "./dayPlot.ts";

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

// The first date stands at the plot's edge and runs right: the second keeps its room from the whole first, as the last keeps its from the axis' end.
describe("dateShown", () => {
  it("skips the second date while it is nearer than a date and a half to the first", () => {
    const w = 350;
    const { every, slot, center } = plotOf({ counts: Array.from({ length: 60 }, () => 1), scale: "log", w, h: 200 });
    expect(dateShown({ at: 0, every, x: LEFT, w })).toBe(true);
    expect(center(every) - LEFT).toBeLessThan(DATE_GAP * 1.5);
    expect(dateShown({ at: every, every, x: center(every), w })).toBe(false);
    expect(dateShown({ at: every * 2, every, x: center(every * 2), w })).toBe(slot * every * 2 >= DATE_GAP * 1.5);
  });

  it("keeps a date off the end, and only every `every` slots", () => {
    expect(dateShown({ at: 5, every: 5, x: 300, w: 330 })).toBe(false);
    expect(dateShown({ at: 4, every: 5, x: 100, w: 330 })).toBe(false);
  });
});
