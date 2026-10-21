import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { limiter } from "./limit.ts";

const WINDOW = 1000;

describe("limiter", () => {
  it("lets the first `max` calls of each key through within a window, and refuses the rest", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom("a", "b", "__proto__", "constructor", "toString"), fc.nat(WINDOW - 1))),
        fc.integer({ min: 1, max: 5 }),
        (calls, max) => {
          const limit = limiter({ max, windowMs: WINDOW, keys: 10 });
          const sorted = calls.toSorted(([, a], [, b]) => a - b);
          const seen = new Map<string, number>();
          for (const [key, now] of sorted) {
            const nth = (seen.get(key) ?? 0) + 1;
            seen.set(key, nth);
            expect(limit.take(key, now)).toBe(nth <= max);
          }
        },
      ),
    );
  });

  it("gives a key its calls again once its window is over, not before", () => {
    const limit = limiter({ max: 2, windowMs: WINDOW, keys: 10 });
    expect([limit.take("a", 0), limit.take("a", 10), limit.take("a", 20)]).toEqual([true, true, false]);
    expect(limit.take("a", WINDOW - 1)).toBe(false);
    expect([limit.take("a", WINDOW), limit.take("a", WINDOW + 1), limit.take("a", WINDOW + 2)]).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("never holds more keys than its cap, over 100,000 distinct keys", () => {
    const limit = limiter({ max: 1, windowMs: WINDOW, keys: 1000 });
    let most = 0;
    for (let i = 0; i < 100_000; i++) {
      limit.take(`k${String(i)}`, i);
      most = Math.max(most, limit.size());
    }
    expect(most).toBe(1000);
  });

  it("drops, past the cap, the key whose window started first, even if it was used last", () => {
    // Its window ends soonest, so dropping it costs the least; it starts over: the limit limit.ts names.
    const limit = limiter({ max: 1, windowMs: WINDOW, keys: 2 });
    expect([limit.take("a", 0), limit.take("b", 1), limit.take("a", 2)]).toEqual([true, true, false]);
    expect(limit.take("c", 3)).toBe(true);
    expect([limit.take("b", 4), limit.take("c", 5)]).toEqual([false, false]);
    expect(limit.take("a", 6)).toBe(true);
  });
});
