import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { middleOf, RISE, riseFrom, riseOf, usualOf, type PresenceSlot } from "./rising.ts";

// A world rises against its own last 14 days (plan §9, question 6; ADR-0002 §10): its people now beside its usual hour, so a small world can
// stand out where a busy one would drown it. The history is 7c's: the busiest sample of each hour, kept 14 days.
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 10, 3, 12, 30);
const hourOf = (time: number) => Math.floor(time / HOUR) * HOUR;
// `hours` hourly samples ending with the hour before now's, each `people` or what `at` gives.
const history = (hours: number, people: number | ((back: number) => number)): PresenceSlot[] =>
  Array.from({ length: hours }, (_, back) => ({
    at: hourOf(NOW) - (hours - back) * HOUR,
    people: typeof people === "number" ? people : people(hours - back),
  }));

describe("a world against its own 14 days", () => {
  it("lets a small world rise: five people where one is usual", () => {
    expect(riseOf(5, history(48, 1), NOW)).toBeCloseTo(4, 9);
  });

  it("keeps a busy world level when it is only a little above its usual", () => {
    expect(riseOf(200, history(48, 180), NOW)).toBeNull();
  });

  it("calls a busy world rising by its own measure, never by the universe's", () => {
    expect(riseOf(240, history(48, 180), NOW)).toBeCloseTo(60 / 180, 9);
  });

  it("says nothing on a history under a day: no usual hour to stand against", () => {
    expect(riseOf(9, history(RISE.hours - 1, 1), NOW)).toBeNull();
    expect(riseOf(9, history(RISE.hours, 1), NOW)).toBeCloseTo(8, 9);
  });

  it("needs a crowd, not one more person: two over a usual of nobody is no rise", () => {
    expect(riseOf(RISE.people - 1, history(48, 0), NOW)).toBeNull();
    expect(riseOf(RISE.people, history(48, 0), NOW)).toBeCloseTo(RISE.people, 9);
  });

  it("stands on the share it names: past a fifth above usual it rises, a fifth or less does not", () => {
    expect(riseOf(60, history(48, 50), NOW)).toBeNull();
    expect(riseOf(60, history(48, 49), NOW)).toBeCloseTo(11 / 49, 9);
    expect(RISE.least).toBe(0.2);
  });

  it("takes the usual hour as the middle of its hours, so one busy evening moves nothing", () => {
    const spiky = history(48, (back) => (back === 3 ? 500 : 2));
    expect(riseOf(9, spiky, NOW)).toBeCloseTo(3.5, 9);
  });

  it("forgets what is older than 14 days, and leaves the hour now out of its own usual", () => {
    const old = history(24, 50).map(({ people }, at) => ({ at: hourOf(NOW) - 15 * DAY - at * HOUR, people }));
    const now = { at: hourOf(NOW), people: 40 };
    expect(riseOf(40, [...old, ...history(30, 10), now], NOW)).toBeCloseTo(3, 9);
    expect(riseOf(40, [...old, now], NOW)).toBeNull();
  });

  it("takes the upper of the two middle hours of an even count", () => {
    const hours = history(24, (back) => back);
    expect(riseOf(30, hours, NOW)).toBeCloseTo((30 - 13) / 13, 9);
  });

  it("counts the hours it holds, not the days they span: a quiet hour the history never kept is no zero", () => {
    const spread = Array.from({ length: RISE.hours }, (_, index) => ({
      at: hourOf(NOW) - (index * 10 + 1) * HOUR,
      people: 4,
    }));
    expect(riseOf(9, spread, NOW)).toBeCloseTo(5 / 4, 9);
  });

  it("keeps an hour exactly 14 days back, and none older", () => {
    const recent = history(RISE.hours - 1, 1);
    expect(riseOf(9, [...recent, { at: hourOf(NOW) - 14 * DAY, people: 1 }], NOW)).toBeCloseTo(8, 9);
    expect(riseOf(9, [...recent, { at: hourOf(NOW) - 14 * DAY - HOUR, people: 1 }], NOW)).toBeNull();
  });

  it("leaves out an hour still to come", () => {
    expect(riseOf(9, [...history(RISE.hours - 1, 1), { at: hourOf(NOW) + HOUR, people: 1 }], NOW)).toBeNull();
  });

  it("says nothing of a count that is no count", () => {
    for (const people of [Number.NaN, -5, Number.POSITIVE_INFINITY])
      expect(riseOf(people, history(48, 1), NOW)).toBeNull();
  });

  it("reads the hours in any order", () => {
    const hours = history(40, (back) => back % 7);
    expect(riseOf(30, [...hours].reverse(), NOW)).toBe(riseOf(30, hours, NOW));
  });

  it("never rises when its people are at or below its usual hour, whatever the history", () => {
    fc.assert(
      fc.property(fc.array(fc.nat({ max: 1000 }), { minLength: 24, maxLength: 336 }), (counts) => {
        const hours = counts.map((people, back) => ({ at: hourOf(NOW) - (back + 1) * HOUR, people }));
        const middle = [...counts].sort((a, b) => a - b)[Math.floor(counts.length / 2)] ?? 0;
        expect(riseOf(Math.min(...counts), hours, NOW)).toBeNull();
        const rise = riseOf(middle * 3 + RISE.people, hours, NOW);
        expect(rise).not.toBeNull();
        expect(rise ?? 0).toBeGreaterThan(0);
      }),
    );
  });
});

// 7t3's score reads each signal against its usual hour through these: the middle, the usual hour, the rise (the review of 7t3, its 5).
describe("the usual hour and its rise", () => {
  it("is the middle of the hours before the one `now` falls in: an hour of now's counts for nothing, past 24 or short of them", () => {
    expect(usualOf(history(RISE.hours, 4), NOW)).toBe(4);
    const thisHour = { at: hourOf(NOW), people: 4 };
    expect(usualOf([...history(RISE.hours - 1, 4), thisHour], NOW), "23 hours and this one").toBeNull();
    expect(usualOf([...history(RISE.hours, 2), thisHour, { at: hourOf(NOW) + 1, people: 9 }], NOW)).toBe(2);
  });

  it("takes the middle of some counts, the upper of the two for an even number, and none of none, whatever their order", () => {
    expect(middleOf([])).toBeUndefined();
    expect(middleOf([5, 1, 3])).toBe(3);
    expect(middleOf([4, 1, 3, 2])).toBe(3);
    const counts = [9, 2, 7];
    expect(middleOf(counts)).toBe(7);
    expect(counts, "left as given").toEqual([9, 2, 7]);
  });

  it("gives a rise as a share of the usual, of one for a usual of none, and a fall below none", () => {
    expect(riseFrom(6, 3)).toBe(1);
    expect(riseFrom(3, 0)).toBe(3);
    expect(riseFrom(2, 4)).toBe(-0.5);
  });
});
