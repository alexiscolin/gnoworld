import { afterEach, describe, expect, it } from "vitest";
import { ago, agoText, clock, dayKey, dayName, moment, shortDay } from "./days.ts";

// The day over a result or a banner, as the canvas words it: Today, Yesterday, else the weekday for the last week, else "4 Nov" (D13015), the year only when it is not this year's.
const reader = { timeZone: "UTC" };
const now = new Date("2026-11-11T12:00:00Z");

describe("a day's name", () => {
  it.each([
    ["2026-11-11T00:00:01Z", "Today"],
    ["2026-11-10T23:59:59Z", "Yesterday"],
    ["2026-11-06T14:05:00Z", "Friday"],
    ["2026-11-04T14:05:00Z", "4 Nov"],
    ["2025-03-02T14:05:00Z", "2 Mar 2025"],
  ])("%s is %s", (time, name) => {
    expect(dayName(new Date(time), now, reader)).toBe(name);
  });

  it("is the date alone for a banner, never Today", () => {
    expect(shortDay(new Date("2026-11-11T09:00:00Z"), now, reader)).toBe("11 Nov");
  });

  it("is a day of the reader's own zone", () => {
    expect(dayName(new Date("2026-11-10T23:30:00Z"), now, { timeZone: "Asia/Tokyo" })).toBe("Today");
  });
});

describe("how long ago", () => {
  const now = Date.parse("2026-11-12T12:00:00Z");
  const before = (minutes: number) => now - minutes * 60_000;

  it("is minutes under an hour, hours under two days, days after, never negative", () => {
    expect(ago(before(5), now)).toEqual({ value: 5, unit: "min ago" });
    expect(ago(before(180), now)).toEqual({ value: 3, unit: "hours ago" });
    expect(ago(before(72 * 60), now)).toEqual({ value: 3, unit: "days ago" });
    expect(ago(now + 60_000, now)).toEqual({ value: 0, unit: "min ago" });
  });

  it("reads as one line", () => {
    expect(agoText(before(180), now)).toBe("3 hours ago");
  });
});

describe("the formatters", () => {
  const Real = Intl.DateTimeFormat;
  afterEach(() => {
    Reflect.set(Intl, "DateTimeFormat", Real);
  });

  it("are made once a zone and kind, not once a line: a room of 200 lines reads each line's day and time", () => {
    let made = 0;
    Reflect.set(
      Intl,
      "DateTimeFormat",
      class extends Real {
        constructor(...args: ConstructorParameters<typeof Real>) {
          super(...args);
          made += 1;
        }
      },
    );
    const at = new Date("2026-11-11T16:06:00Z");
    for (let line = 0; line < 200; line += 1) {
      dayKey(at, "Europe/Paris");
      clock(at, { timeZone: "Europe/Paris" });
      moment(at, now, { timeZone: "Europe/Paris" });
    }
    expect(made).toBeLessThanOrEqual(2);
    expect([dayKey(at, "Europe/Paris"), clock(at, { timeZone: "Europe/Paris" })]).toEqual(["2026-11-11", "17:06"]);
    expect(clock(at, { timeZone: "UTC" })).toBe("16:06");
  });
});
