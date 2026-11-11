import { describe, expect, it } from "vitest";
import { stampOf } from "./stamp.ts";

// When a file was read, as the home writes it (the block's line, the posts): a clock time, a date before today, and no time at all for one
// too far ahead of ours. Moved from the markets row's tests when the row stopped writing it (D345).
describe("stampOf", () => {
  const NOW = new Date("2026-10-31T06:07:00.000Z");
  it.each([
    ["the same minute", "2026-10-31T06:07:00.000Z", "06:07 UTC"],
    ["earlier today", "2026-10-31T03:07:00.000Z", "03:07 UTC"],
    ["yesterday", "2026-10-30T23:59:00.000Z", "30 Oct 23:59 UTC"],
    ["a day in January", "2026-01-05T08:09:00.000Z", "5 Jan 08:09 UTC"],
    ["a few minutes ahead of our clock", "2026-10-31T06:09:00.000Z", "06:09 UTC"],
    ["exactly ten minutes ahead of our clock", "2026-10-31T06:17:00.000Z", "06:17 UTC"],
    ["more than ten minutes ahead of our clock", "2026-10-31T06:17:01.000Z", "time unknown"],
    ["the year 2099", "2099-01-01T00:00:00.000Z", "time unknown"],
  ])("writes a time %s as %s", (_what, updated, wanted) => {
    expect(stampOf(updated, NOW)).toBe(wanted);
  });
});
