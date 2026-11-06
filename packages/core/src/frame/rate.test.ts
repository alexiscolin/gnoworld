import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { carryOver, frameRate, frameWait, isDue, type LoopState } from "./rate.ts";

const MINUTE = 60_000;
const SCENERY: LoopState = {
  hidden: false,
  covered: false,
  focused: true,
  busy: false,
  owed: false,
  still: false,
  sinceInput: 0,
};

describe("frameRate", () => {
  it.each([
    ["only scenery moves", {}, 30],
    ["a flight or an interaction", { busy: true }, 60],
    ["a frame is owed", { owed: true }, 60],
    ["59.999 s with no input", { sinceInput: MINUTE - 1 }, 30],
    ["a minute with no input", { sinceInput: MINUTE }, 10],
    ["an hour with no input", { sinceInput: 60 * MINUTE }, 10],
    ["a flight long after the last input", { busy: true, sinceInput: 60 * MINUTE }, 60],
    ["reduced motion, nothing changing", { still: true }, 0],
    ["reduced motion, a frame owed", { still: true, owed: true }, 60],
    ["reduced motion, a crossfade running", { still: true, busy: true }, 60],
    ["a blurred window, nothing moving", { focused: false }, 0],
    ["a blurred window, a flight running", { focused: false, busy: true }, 60],
    ["a blurred window, a frame owed", { focused: false, owed: true }, 60],
    ["a hidden tab", { hidden: true }, 0],
    ["a hidden tab, a flight running", { hidden: true, busy: true }, 0],
    ["a hidden tab, a frame owed", { hidden: true, owed: true }, 0],
    ["an opaque view", { covered: true }, 0],
    ["an opaque view, a flight running", { covered: true, busy: true }, 0],
    ["an opaque view, a frame owed", { covered: true, owed: true }, 0],
  ] satisfies [string, Partial<LoopState>, number][])("%s", (_, change, rate) => {
    expect(frameRate({ ...SCENERY, ...change })).toBe(rate);
  });

  it("draws nothing hidden or covered, whatever else is true, and never above 60", () => {
    fc.assert(
      fc.property(
        fc.record({
          hidden: fc.boolean(),
          covered: fc.boolean(),
          focused: fc.boolean(),
          busy: fc.boolean(),
          owed: fc.boolean(),
          still: fc.boolean(),
          sinceInput: fc.nat(),
        }),
        (state) => {
          const rate = frameRate(state);
          expect([0, 10, 30, 60]).toContain(rate);
          if (state.hidden || state.covered) expect(rate).toBe(0);
        },
      ),
    );
  });
});

const SECONDS = 20;

// The frames a screen of `hz` draws at `rate` over 20 s, as the loop steps through them: its refreshes in order.
function drawn(hz: number, rate: 10 | 30 | 60, jitter: (refresh: number) => number = () => 0): number {
  let carried = 0;
  let draws = 0;
  for (let refresh = 0; refresh < hz * SECONDS; refresh += 1) {
    const elapsed = 1000 / hz + jitter(refresh);
    if (isDue(carried, elapsed, rate)) {
      carried = carryOver(carried, elapsed, rate);
      draws += 1;
    } else carried += elapsed;
  }
  return draws;
}

describe("the budget carried over", () => {
  it.each([24, 30, 50, 60, 75, 90, 100, 120, 144, 165, 240])(
    "keeps a %i Hz screen at 60, 30 and 10, or its own rate under",
    (hz) => {
      for (const rate of [60, 30, 10] as const) {
        const want = Math.min(rate, hz) * SECONDS;
        expect(Math.abs(drawn(hz, rate) - want), `${String(rate)} fps`).toBeLessThanOrEqual(1);
      }
    },
  );

  it("drops no frame of a screen at the rate whose refreshes jitter by 2 ms", () => {
    const jitter = (refresh: number) => (refresh % 2 === 0 ? -2 : 2);
    expect(drawn(60, 60, jitter)).toBe(60 * SECONDS);
    expect(drawn(30, 30, jitter)).toBe(30 * SECONDS);
  });

  it("never draws faster than its rate, on any screen from 60 to 240 Hz", () => {
    fc.assert(
      fc.property(fc.integer({ min: 60, max: 240 }), fc.constantFrom<10 | 30 | 60>(10, 30, 60), (hz, rate) => {
        expect(drawn(hz, rate)).toBeLessThanOrEqual(rate * SECONDS + 1);
      }),
    );
  });

  it("makes no burst after a stall: five seconds lost are not drawn back", () => {
    const interval = 1000 / 30;
    let carried = carryOver(0, 5000, 30);
    expect(carried).toBeLessThan(interval);
    let draws = 0;
    for (let refresh = 0; refresh < 60; refresh += 1) {
      if (isDue(carried, 1000 / 60, 30)) {
        carried = carryOver(carried, 1000 / 60, 30);
        draws += 1;
      } else carried += 1000 / 60;
    }
    expect(draws).toBeLessThanOrEqual(31);
  });

  it("owes nothing at 0 fps", () => {
    expect(isDue(0, 60_000, 0)).toBe(false);
    expect(carryOver(12, 60_000, 0)).toBe(0);
  });

  it("is not due an instant after a frame", () => {
    expect(isDue(0, 1, 60)).toBe(false);
  });
});

describe("frameWait", () => {
  it("asks for the next refresh at once at 60, for a timer has nothing to save there", () => {
    expect(frameWait(0, 60)).toBeLessThan(1000 / 60);
  });

  it("wakes before the frame is due, by less than a 60 Hz refresh", () => {
    for (const rate of [30, 10] as const) {
      const interval = 1000 / rate;
      expect(frameWait(0, rate)).toBeLessThan(interval);
      expect(frameWait(0, rate)).toBeGreaterThan(interval - 1000 / 60);
    }
  });

  it("counts the budget already carried", () => {
    expect(frameWait(-4, 30)).toBeCloseTo(frameWait(0, 30) + 4);
    expect(frameWait(4, 30)).toBeCloseTo(frameWait(0, 30) - 4);
  });
});
