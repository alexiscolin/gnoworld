import { describe, expect, it } from "vitest";
import { textHash } from "../space/cell.ts";
import { daysBetween, utcDay } from "./day.ts";
import { expeditionOf, reach, reachedOn, streakAfter, streakOn } from "./expedition.ts";

// The daily expedition (slice 8, row 8: "the same for everyone on a given day"; "streaks count UTC days"): three stops, a pure function of
// the UTC day and the curated pool, the live stop first; what a device reached that day; the streak, one step a UTC day.
const pool = Array.from({ length: 12 }, (_, i) => ({ id: `stop-${String(i)}` }));
const ids = (stops: readonly { id: string }[]) => stops.map(({ id }) => id);

describe("the UTC day", () => {
  it("is the day of the instant in UTC, whatever offset the clock wrote it with", () => {
    expect(utcDay(new Date("2026-11-04T23:59:59.999Z"))).toBe("2026-11-04");
    expect(utcDay(new Date("2026-11-05T00:00:00.000Z"))).toBe("2026-11-05");
    // 01:30 in Paris on the 5th is still the 4th in UTC.
    expect(utcDay(new Date("2026-11-05T01:30:00+02:00"))).toBe("2026-11-04");
  });

  it("counts whole days across a month end, a year end, a leap day and a DST change", () => {
    expect(daysBetween("2026-01-31", "2026-02-01")).toBe(1);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2028-02-28", "2028-02-29")).toBe(1);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-11-05", "2026-11-04")).toBe(-1);
    expect(daysBetween("2026-11-05", "2026-11-05")).toBe(0);
  });

  it("reads a day that is none as no number", () => {
    expect(daysBetween("never", "2026-11-05")).toBeNaN();
  });
});

describe("the day's expedition", () => {
  it("is the same three stops on every device for a day, whatever the file's order", () => {
    const day = "2026-11-05";
    const one = ids(expeditionOf(day, pool));
    expect(one).toHaveLength(3);
    expect(new Set(one).size).toBe(3);
    expect(ids(expeditionOf(day, pool.toReversed()))).toEqual(one);
    expect(ids(expeditionOf(day, [...pool.slice(6), ...pool.slice(0, 6)]))).toEqual(one);
  });

  it("is these three stops on these days, on every device and every version of the page that reads expedition v1", () => {
    // A golden vector: a change of the salt or of the hash moves every device's day, which this catches.
    expect(ids(expeditionOf("2026-11-05", pool))).toEqual(["stop-1", "stop-3", "stop-11"]);
    expect(ids(expeditionOf("2026-11-06", pool))).toEqual(["stop-6", "stop-4", "stop-7"]);
  });

  it("changes with the day", () => {
    const days = Array.from({ length: 14 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);
    const seen = new Set(days.map((day) => ids(expeditionOf(day, pool)).join(",")));
    expect(seen.size).toBeGreaterThan(7);
    // Every stop of the pool comes up over a fortnight: no stop is left out by the shuffle.
    const picked = new Set(days.flatMap((day) => ids(expeditionOf(day, pool))));
    expect(picked.size).toBe(pool.length);
  });

  it("puts the live stop first, then the shuffle's next stops", () => {
    const live = pool.map((stop) => ({ ...stop, live: stop.id === "stop-7" }));
    for (const day of ["2026-11-05", "2026-11-06", "2026-12-31"]) {
      const stops = expeditionOf(day, live);
      expect(stops[0]?.id).toBe("stop-7");
      expect(stops).toHaveLength(3);
      const plain = ids(expeditionOf(day, pool)).filter((id) => id !== "stop-7");
      expect(ids(stops.slice(1))).toEqual(plain.slice(0, 2));
    }
  });

  it("takes the shuffle's first live stop when several are live, and keeps the order when none is", () => {
    const day = "2026-11-05";
    const order = ids(
      expeditionOf(
        day,
        pool.map((stop) => ({ ...stop, live: true })),
      ),
    );
    expect(order).toEqual(ids(expeditionOf(day, pool)));
    const off = expeditionOf(
      day,
      pool.map((stop) => ({ ...stop, live: false })),
    );
    expect(ids(off)).toEqual(ids(expeditionOf(day, pool)));
  });

  it("gives every stop of a small pool, and none of an empty one", () => {
    const two = [{ id: "a" }, { id: "b" }];
    expect(ids(expeditionOf("2026-11-05", two)).toSorted()).toEqual(["a", "b"]);
    expect(expeditionOf("2026-11-05", [])).toEqual([]);
    expect(ids(expeditionOf("2026-11-05", [{ id: "solo", live: true }]))).toEqual(["solo"]);
  });

  it("orders two stops of one hash by their id, so the order never depends on the file", () => {
    // Two ids whose hash on this day is the same, found by search.
    const day = "2026-11-05";
    expect(textHash(`gnoworld/expedition/v1 ${day} s7vl8`)).toBe(textHash(`gnoworld/expedition/v1 ${day} sopd6`));
    const twins = [{ id: "sopd6" }, { id: "s7vl8" }];
    expect(ids(expeditionOf(day, twins))).toEqual(["s7vl8", "sopd6"]);
    expect(ids(expeditionOf(day, twins.toReversed()))).toEqual(["s7vl8", "sopd6"]);
  });
});

describe("the stops a device reached", () => {
  it("reads none from another day's record, or from none", () => {
    expect(reachedOn(null, "2026-11-05")).toEqual([]);
    expect(reachedOn({ day: "2026-11-04", reached: ["a"] }, "2026-11-05")).toEqual([]);
    expect(reachedOn({ day: "2026-11-05", reached: ["a"] }, "2026-11-05")).toEqual(["a"]);
  });

  it("adds a stop once, and starts again on a new day", () => {
    const first = reach(null, "2026-11-05", "gnoland:a");
    expect(first).toEqual({ day: "2026-11-05", reached: ["gnoland:a"] });
    expect(reach(first, "2026-11-05", "gnoland:a")).toEqual(first);
    expect(reach(first, "2026-11-05", "gnoland:b")).toEqual({
      day: "2026-11-05",
      reached: ["gnoland:a", "gnoland:b"],
    });
    expect(reach(first, "2026-11-06", "gnoland:b")).toEqual({ day: "2026-11-06", reached: ["gnoland:b"] });
  });

  it("never changes the record it is given", () => {
    const held = { day: "2026-11-05", reached: ["a"] };
    const next = reach(held, "2026-11-05", "a");
    expect(next.reached).not.toBe(held.reached);
    reach(held, "2026-11-05", "b");
    expect(held).toEqual({ day: "2026-11-05", reached: ["a"] });
  });
});

describe("the streak, by UTC day", () => {
  it("starts at one", () => {
    expect(streakAfter(null, "2026-11-05")).toEqual({ day: "2026-11-05", count: 1, best: 1 });
  });

  it("adds one on the next day, across a month end and a year end", () => {
    expect(streakAfter({ day: "2026-11-04", count: 3, best: 3 }, "2026-11-05")).toEqual({
      day: "2026-11-05",
      count: 4,
      best: 4,
    });
    expect(streakAfter({ day: "2026-10-31", count: 1, best: 9 }, "2026-11-01")).toEqual({
      day: "2026-11-01",
      count: 2,
      best: 9,
    });
    expect(streakAfter({ day: "2026-12-31", count: 2, best: 2 }, "2027-01-01").count).toBe(3);
  });

  it("starts again at one after a gap of a day, and keeps the longest run", () => {
    expect(streakAfter({ day: "2026-11-03", count: 5, best: 5 }, "2026-11-05")).toEqual({
      day: "2026-11-05",
      count: 1,
      best: 5,
    });
    expect(streakAfter({ day: "2026-10-01", count: 2, best: 7 }, "2026-11-05")).toEqual({
      day: "2026-11-05",
      count: 1,
      best: 7,
    });
  });

  it("changes nothing on the same day twice, or on a day before the last (a clock set back)", () => {
    const held = { day: "2026-11-05", count: 4, best: 6 };
    expect(streakAfter(held, "2026-11-05")).toBe(held);
    expect(streakAfter(held, "2026-11-04")).toBe(held);
    expect(streakAfter(held, "2025-11-05")).toBe(held);
  });

  it("changes nothing for a day that is none", () => {
    const held = { day: "2026-11-05", count: 4, best: 6 };
    expect(streakAfter(held, "not a day")).toBe(held);
  });

  it("farms nothing from a clock moved forward then back: one step a day", () => {
    let streak = streakAfter(null, "2026-11-05");
    streak = streakAfter(streak, "2026-11-06");
    streak = streakAfter(streak, "2026-11-05");
    streak = streakAfter(streak, "2026-11-06");
    expect(streak).toEqual({ day: "2026-11-06", count: 2, best: 2 });
  });

  it("is shown while its last day is today or yesterday, else none", () => {
    const held = { day: "2026-11-05", count: 4, best: 6 };
    expect(streakOn(held, "2026-11-05")).toBe(4);
    expect(streakOn(held, "2026-11-06")).toBe(4);
    expect(streakOn(held, "2026-11-07")).toBe(0);
    expect(streakOn(held, "2026-11-04")).toBe(0);
    expect(streakOn(null, "2026-11-05")).toBe(0);
    expect(streakOn({ day: "2026-11-30", count: 2, best: 2 }, "2026-12-01")).toBe(2);
  });
});
