import { describe, expect, it } from "vitest";
import { dayName, shortDay } from "./days.ts";

// The day over a result or a banner, as the canvas words it: Today, Yesterday, else "Nov 4", the year only when it is not this year's.
const reader = { timeZone: "UTC", locale: "en-US" };
const now = new Date("2026-11-11T12:00:00Z");

describe("a day's name", () => {
  it.each([
    ["2026-11-11T00:00:01Z", "Today"],
    ["2026-11-10T23:59:59Z", "Yesterday"],
    ["2026-11-04T14:05:00Z", "Nov 4"],
    ["2025-03-02T14:05:00Z", "Mar 2, 2025"],
  ])("%s is %s", (time, name) => {
    expect(dayName(new Date(time), now, reader)).toBe(name);
  });

  it("is the date alone for a banner, never Today", () => {
    expect(shortDay(new Date("2026-11-11T09:00:00Z"), now, reader)).toBe("Nov 11");
  });

  it("is a day of the reader's own zone", () => {
    expect(dayName(new Date("2026-11-10T23:30:00Z"), now, { timeZone: "Asia/Tokyo", locale: "en-US" })).toBe("Today");
  });
});
