import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { nextVitality, presenceOf, referenceOf, useOf } from "./gauges.ts";

// A world's two gauges (slice 7, 7b2; ADR-0002 §10): a vitality that remembers and moves a few percent a day, and the people present.
const RISE = 0.03;
const FALL = 0.01;
const unit = fc.double({ min: 0, max: 1, noNaN: true });
const days = fc.double({ min: 0, max: 400, noNaN: true });
const wild = fc.oneof(fc.double(), fc.constantFrom(Number.NaN, Infinity, -Infinity, -1, 0, 2));

describe("nextVitality", () => {
  it("climbs 3% a day at most, and falls 1%: it remembers", () => {
    expect(nextVitality(0.2, 1, 1)).toBeCloseTo(0.23, 12);
    expect(nextVitality(0.2, 0, 1)).toBeCloseTo(0.19, 12);
  });

  it("never moves faster than its pace, whatever the use", () => {
    fc.assert(
      fc.property(unit, unit, days, (vitality, use, span) => {
        const next = nextVitality(vitality, use, span);
        expect(next - vitality).toBeLessThanOrEqual(RISE * span + 1e-12);
        expect(vitality - next).toBeLessThanOrEqual(FALL * span + 1e-12);
      }),
    );
  });

  it("stops at its use and never passes it, either way", () => {
    fc.assert(
      fc.property(unit, unit, days, (vitality, use, span) => {
        const next = nextVitality(vitality, use, span);
        expect(next).toBeGreaterThanOrEqual(Math.min(vitality, use));
        expect(next).toBeLessThanOrEqual(Math.max(vitality, use));
      }),
    );
    expect(nextVitality(0.5, 0.51, 10)).toBe(0.51);
    expect(nextVitality(0.5, 0.49, 10)).toBe(0.49);
  });

  it("gives the same reading for a month read daily or at once", () => {
    let daily = 0.1;
    for (let day = 0; day < 30; day += 1) daily = nextVitality(daily, 0.9, 1);
    expect(daily).toBeCloseTo(nextVitality(0.1, 0.9, 30), 9);
  });

  it("shrugs off an hour's crowd: a world changes little by little, not overnight", () => {
    expect(nextVitality(0.2, 1, 1 / 24)).toBeCloseTo(0.20125, 12);
  });

  it("takes about a month from nothing to the top, and three from the top to nothing", () => {
    expect(nextVitality(0, 1, 33)).toBeLessThan(1);
    expect(nextVitality(0, 1, 34)).toBe(1);
    expect(nextVitality(1, 0, 99)).toBeGreaterThan(0);
    expect(nextVitality(1, 0, 100)).toBe(0);
  });

  it("stands still when no time passed, or time ran backward", () => {
    expect(nextVitality(0.4, 1, 0)).toBe(0.4);
    expect(nextVitality(0.4, 1, -3)).toBe(0.4);
    expect(nextVitality(0.4, 1, Number.NaN)).toBe(0.4);
  });

  it("stays a share whatever it is handed", () => {
    fc.assert(
      fc.property(wild, wild, wild, (vitality, use, span) => {
        const next = nextVitality(vitality, use, span);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThanOrEqual(1);
      }),
    );
  });
});

describe("useOf", () => {
  const busiest = { social: 1000, realm: 500 };

  it("is half social and half realm", () => {
    expect(useOf(busiest, busiest)).toBe(1);
    expect(useOf({ social: 1000, realm: 0 }, busiest)).toBe(0.5);
    expect(useOf({ social: 0, realm: 500 }, busiest)).toBe(0.5);
    expect(useOf({ social: 0, realm: 0 }, busiest)).toBe(0);
  });

  it("climbs a logarithmic ladder relative to the universe", () => {
    const expected = (Math.log1p(100) / Math.log1p(1000)) * 0.5;
    expect(useOf({ social: 100, realm: 0 }, busiest)).toBeCloseTo(expected, 12);
  });

  it("is a share past the busiest", () => {
    expect(useOf({ social: 5000, realm: 9000 }, busiest)).toBe(1);
  });

  it("calls nobody the top of a quiet universe: one message is no beacon, for its ladder starts at 31", () => {
    const one = Math.log1p(1) / Math.log1p(31);
    expect(useOf({ social: 1, realm: 1 }, { social: 1, realm: 1 })).toBeCloseTo(one, 12);
    expect(useOf({ social: 1, realm: 1 }, { social: 0, realm: 0 })).toBeCloseTo(one, 12);
    expect(useOf({ social: 1, realm: 0 }, { social: 0, realm: 500 })).toBeCloseTo(one / 2, 12);
    expect(useOf({ social: 0, realm: 0 }, { social: 0, realm: 0 })).toBe(0);
  });

  it("stays a share whatever it is handed", () => {
    fc.assert(
      fc.property(fc.tuple(wild, wild, wild, wild), ([social, realm, top, peak]) => {
        const use = useOf({ social, realm }, { social: top, realm: peak });
        expect(use).toBeGreaterThanOrEqual(0);
        expect(use).toBeLessThanOrEqual(1);
      }),
    );
    expect(useOf({ social: Infinity, realm: Infinity }, { social: Infinity, realm: Infinity })).toBe(0);
    expect(useOf({ social: 5, realm: 5 }, { social: Infinity, realm: Number.NaN })).toBe(0);
  });
});

describe("presenceOf", () => {
  it("follows the logarithm of the count, against the busiest world of the day", () => {
    expect(presenceOf(1000, 1000)).toBe(1);
    expect(presenceOf(0, 1000)).toBe(0);
    expect(presenceOf(100, 1000)).toBeCloseTo(Math.log1p(100) / Math.log1p(1000), 12);
  });

  it("shows a quiet world a little, and caps the busiest", () => {
    expect(presenceOf(1, 1000)).toBeGreaterThan(0.09);
    expect(presenceOf(5000, 1000)).toBe(1);
  });

  it("calls nobody the busiest world for one person: its ladder starts at 31 people", () => {
    expect(presenceOf(1, 1)).toBeCloseTo(Math.log1p(1) / Math.log1p(31), 12);
    expect(presenceOf(31, 0)).toBe(1);
    expect(presenceOf(0, 0)).toBe(0);
  });

  it("never falls as people arrive", () => {
    fc.assert(
      fc.property(fc.nat(100_000), fc.nat(100_000), fc.nat(100_000), (people, more, busiest) => {
        expect(presenceOf(people + more, busiest)).toBeGreaterThanOrEqual(presenceOf(people, busiest));
      }),
    );
  });

  it("stays a share whatever it is handed", () => {
    fc.assert(
      fc.property(wild, wild, (people, busiest) => {
        const present = presenceOf(people, busiest);
        expect(present).toBeGreaterThanOrEqual(0);
        expect(present).toBeLessThanOrEqual(1);
      }),
    );
    expect(presenceOf(Infinity, Infinity)).toBe(0);
    expect(presenceOf(5, Infinity)).toBe(0);
    expect(presenceOf(Number.NaN, 10)).toBe(0);
  });
});

describe("referenceOf", () => {
  const quiet = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ social: (index % 40) + 1, realm: (index % 25) + 1 }));

  it("reads the universe at its 95th percentile, each half apart, nearest rank", () => {
    const worlds = Array.from({ length: 100 }, (_, index) => ({ social: index + 1, realm: 2 * (100 - index) }));
    expect(referenceOf(worlds)).toEqual({ social: 95, realm: 190 });
  });

  it("takes the nearest rank at any size: one world, ten, twenty-one", () => {
    const of = (count: number) =>
      referenceOf(Array.from({ length: count }, (_, index) => ({ social: count - index, realm: index + 1 })));
    expect(of(1)).toEqual({ social: 1, realm: 1 });
    expect(of(10)).toEqual({ social: 10, realm: 10 });
    expect(of(21)).toEqual({ social: 20, realm: 20 });
  });

  it("lets no outlier, 1,023 sybil callers or a million, move another world's use (F4111)", () => {
    const worlds = quiet(533);
    const reference = referenceOf(worlds);
    for (const sybil of [1023, 1e6, 1e12]) {
      const withSybil = referenceOf([...worlds, { social: 0, realm: sybil }]);
      expect(useOf({ social: 12, realm: 9 }, withSybil)).toBeCloseTo(useOf({ social: 12, realm: 9 }, reference), 12);
    }
  });

  it("counts a world's count that is no number as nothing (A1-4)", () => {
    const worlds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((count) => ({
      social: count,
      realm: count,
    }));
    const spoilt = [...worlds, { social: Number.NaN, realm: Infinity }, { social: -Infinity, realm: Number.NaN }];
    // Twenty-two worlds, the two spoilt ones at nothing: the 95th percentile is the 21st, 19.
    expect(referenceOf(spoilt)).toEqual({ social: 19, realm: 19 });
  });

  it("is nothing for an empty universe, so the ladder's own floor holds", () => {
    expect(referenceOf([])).toEqual({ social: 0, realm: 0 });
  });

  it("never passes the busiest world, nor falls under the quietest", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.nat(10_000), fc.nat(10_000)), { minLength: 1, maxLength: 60 }), (pairs) => {
        const worlds = pairs.map(([social, realm]) => ({ social, realm }));
        const { social, realm } = referenceOf(worlds);
        expect(social).toBeLessThanOrEqual(Math.max(...pairs.map(([each]) => each)));
        expect(social).toBeGreaterThanOrEqual(Math.min(...pairs.map(([each]) => each)));
        expect(realm).toBeLessThanOrEqual(Math.max(...pairs.map(([, each]) => each)));
      }),
    );
  });
});
