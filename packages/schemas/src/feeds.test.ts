import { describe, expect, it } from "vitest";
import { OnAir } from "./feeds.ts";

// The team's hand-copied file (slice 8, 8i): what a row of onAir.json may hold.
const line = (over: Record<string, unknown> = {}) => ({
  id: "l",
  universe: "onyx",
  title: "Live",
  link: "https://gno.land/",
  ...over,
});

describe("onAir.json", () => {
  it("takes a line leading to a world by its hub or to another site by its link, and an end date", () => {
    const rows = [line(), line({ id: "m", link: undefined, hub: "bubble", until: "2026-12-01T00:00:00Z" })];
    expect(OnAir.safeParse(rows).success).toBe(true);
  });

  it("refuses a line with both a hub and a link, or with neither", () => {
    expect(OnAir.safeParse([line({ hub: "bubble" })]).success).toBe(false);
    expect(OnAir.safeParse([line({ link: undefined })]).success).toBe(false);
  });

  it("refuses a link that is not https, a hub that is not a slug, and an `until` that is not a date", () => {
    for (const over of [
      { link: "http://gno.land/" },
      { link: "javascript:alert(1)" },
      { link: undefined, hub: "Not A Slug" },
      { until: "soon" },
    ]) {
      expect(OnAir.safeParse([line(over)]).success, JSON.stringify(over)).toBe(false);
    }
  });

  it("refuses an empty title, one past 120 characters and two lines of one id", () => {
    expect(OnAir.safeParse([line({ title: "a".repeat(120) })]).success).toBe(true);
    expect(OnAir.safeParse([line({ title: "" })]).success).toBe(false);
    expect(OnAir.safeParse([line({ title: "a".repeat(121) })]).success).toBe(false);
    expect(OnAir.safeParse([line(), line()]).success).toBe(false);
  });
});
