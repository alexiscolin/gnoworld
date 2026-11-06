import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { presenceOf } from "../planet/gauges.ts";
import {
  MOON_HOLD_MS,
  MOON_SET_MS,
  MOON_SMALLEST,
  moonSize,
  MOONS_MAX,
  nextMoons,
  type Moons,
  type RoomCount,
} from "./moons.ts";

// Rooms as moons (ADR-0002 §1 and §3): a world's busiest rooms orbit it, four at most, and the room you are in is always one. Moons stay
// steady: the set changes at most once a minute, and a room takes a moon's place only when it stays clearly busier for several minutes.
// A world with no active room has none. A moon's size follows the people present, on a log scale.
const T0 = 1_800_000_000_000;
const rooms = (...counts: readonly (readonly [string, number])[]): RoomCount[] =>
  counts.map(([room, people]) => ({ room, people }));

describe("nextMoons", () => {
  it("takes the busiest rooms at once on arrival, four at most, the busiest first", () => {
    const moons = nextMoons(undefined, rooms(["#a", 3], ["#b", 40], ["#c", 9], ["#d", 1], ["#e", 20], ["#f", 2]), {
      current: undefined,
      now: T0,
    });
    expect(moons.rooms).toEqual(["#b", "#e", "#c", "#a"]);
  });

  it("always keeps the room you are in, quiet or not, in a slot of its own", () => {
    const moons = nextMoons(undefined, rooms(["#a", 3], ["#b", 40], ["#c", 9], ["#d", 0], ["#e", 20]), {
      current: "#d",
      now: T0,
    });
    expect(moons.rooms).toHaveLength(MOONS_MAX);
    expect(moons.rooms).toContain("#d");
    expect(moons.rooms.filter((room) => room !== "#d")).toEqual(["#b", "#e", "#c"]);
  });

  it("gives a world whose rooms hold nobody no moon, but the room you are in", () => {
    expect(nextMoons(undefined, rooms(["#a", 0], ["#b", 0]), { current: undefined, now: T0 }).rooms).toEqual([]);
    expect(nextMoons(undefined, rooms(["#a", 0], ["#b", 0]), { current: "#b", now: T0 }).rooms).toEqual(["#b"]);
  });

  it("lets a newly busy room wait its several minutes before it takes the quietest moon's place", () => {
    const start = nextMoons(undefined, rooms(["#a", 9], ["#b", 8], ["#c", 7], ["#d", 6], ["#e", 0]), {
      current: undefined,
      now: T0,
    });
    const busy = rooms(["#a", 9], ["#b", 8], ["#c", 7], ["#d", 6], ["#e", 30]);
    let moons = start;
    for (let at = T0; at < T0 + MOON_HOLD_MS; at += 10_000)
      moons = nextMoons(moons, busy, { current: undefined, now: at });
    expect(moons.rooms).not.toContain("#e");
    moons = nextMoons(moons, busy, { current: undefined, now: T0 + MOON_HOLD_MS + 10_000 });
    expect(moons.rooms).toContain("#e");
    expect(moons.rooms).not.toContain("#d");
  });

  it("forgets a room's rise when it stops being clearly busier, so a flicker never swaps a moon", () => {
    let moons = nextMoons(undefined, rooms(["#a", 9], ["#b", 8], ["#c", 7], ["#d", 6], ["#e", 0]), {
      current: undefined,
      now: T0,
    });
    for (let at = T0; at < T0 + 2 * MOON_HOLD_MS; at += 10_000) {
      const flicker = (at - T0) % 60_000 < 30_000 ? 30 : 6;
      moons = nextMoons(moons, rooms(["#a", 9], ["#b", 8], ["#c", 7], ["#d", 6], ["#e", flicker]), {
        current: undefined,
        now: at,
      });
    }
    expect(moons.rooms).not.toContain("#e");
  });

  it("changes the set at most once a minute, whatever the counts do", () => {
    const names = ["#a", "#b", "#c", "#d", "#e", "#f", "#g"];
    fc.assert(
      fc.property(
        fc.array(fc.array(fc.nat({ max: 60 }), { minLength: 7, maxLength: 7 }), { maxLength: 80 }),
        (steps) => {
          let moons = nextMoons(undefined, rooms(...names.map((room) => [room, 1] as const)), {
            current: undefined,
            now: T0,
          });
          let changes: number[] = [];
          steps.forEach((counts, step) => {
            const at = T0 + (step + 1) * 5_000;
            const next = nextMoons(moons, rooms(...names.map((room, index) => [room, counts[index] ?? 0] as const)), {
              current: undefined,
              now: at,
            });
            if (next.rooms.join() !== moons.rooms.join()) changes = [...changes, at];
            moons = next;
          });
          expect(changes.length).toBeLessThanOrEqual(Math.floor((steps.length * 5_000) / MOON_SET_MS) + 1);
          for (let at = 1; at < changes.length; at += 1)
            expect((changes[at] ?? 0) - (changes[at - 1] ?? 0)).toBeGreaterThanOrEqual(MOON_SET_MS);
        },
      ),
    );
  });

  it("orders rooms of equal counts by their name, so two readers see the same moons", () => {
    const moons = nextMoons(undefined, rooms(["#d", 5], ["#b", 5], ["#a", 5], ["#c", 5], ["#e", 5]), {
      current: undefined,
      now: T0,
    });
    expect(moons.rooms).toEqual(["#a", "#b", "#c", "#d"]);
  });

  it("lets a room that has been clearly busier for the whole hold in, and not a moment before", () => {
    const start = nextMoons(undefined, rooms(["#a", 9], ["#b", 8], ["#c", 7], ["#d", 6], ["#e", 0]), {
      current: undefined,
      now: T0 - MOON_SET_MS,
    });
    const busy = rooms(["#a", 9], ["#b", 8], ["#c", 7], ["#d", 6], ["#e", 30]);
    const rising = nextMoons(start, busy, { current: undefined, now: T0 });
    expect(nextMoons(rising, busy, { current: undefined, now: T0 + MOON_HOLD_MS - 1 }).rooms).not.toContain("#e");
    expect(nextMoons(rising, busy, { current: undefined, now: T0 + MOON_HOLD_MS }).rooms).toContain("#e");
  });

  it("never lets a room that is only a little busier take a moon's place, however long it stays so", () => {
    let moons = nextMoons(undefined, rooms(["#a", 9], ["#b", 8], ["#c", 7], ["#d", 6], ["#e", 0]), {
      current: undefined,
      now: T0,
    });
    for (let at = T0; at < T0 + 3 * MOON_HOLD_MS; at += 10_000)
      moons = nextMoons(moons, rooms(["#a", 9], ["#b", 8], ["#c", 7], ["#d", 6], ["#e", 7]), {
        current: undefined,
        now: at,
      });
    expect(moons.rooms).not.toContain("#e");
  });

  it("makes a second room that is due wait a minute after the first change", () => {
    const start = nextMoons(undefined, rooms(["#a", 9], ["#b", 8], ["#c", 7], ["#d", 6]), {
      current: undefined,
      now: T0 - 10 * MOON_SET_MS,
    });
    const counts = (f: number, g: number) => rooms(["#a", 9], ["#b", 8], ["#c", 7], ["#d", 6], ["#f", f], ["#g", g]);
    let moons = nextMoons(start, counts(30, 0), { current: undefined, now: T0 });
    moons = nextMoons(moons, counts(30, 40), { current: undefined, now: T0 + 10_000 });
    moons = nextMoons(moons, counts(30, 40), { current: undefined, now: T0 + MOON_HOLD_MS });
    expect(moons.rooms).toContain("#f");
    expect(moons.rooms).not.toContain("#g");
    moons = nextMoons(moons, counts(30, 40), { current: undefined, now: T0 + MOON_HOLD_MS + 10_000 });
    expect(moons.rooms).not.toContain("#g");
    moons = nextMoons(moons, counts(30, 40), { current: undefined, now: T0 + MOON_HOLD_MS + MOON_SET_MS });
    expect(moons.rooms).toContain("#g");
  });

  it("puts the room you move to in at once, a few seconds after a change, outside the minute's rule", () => {
    const start = nextMoons(undefined, rooms(["#a", 9], ["#b", 8], ["#c", 7], ["#d", 6], ["#e", 1]), {
      current: undefined,
      now: T0,
    });
    const moved = nextMoons(start, rooms(["#a", 9], ["#b", 8], ["#c", 7], ["#d", 6], ["#e", 1]), {
      current: "#e",
      now: T0 + 5_000,
    });
    expect(moved.rooms).toContain("#e");
    expect(moved.rooms).toHaveLength(MOONS_MAX);
  });

  it("never swaps a moon while the counts stand still, whatever room you are in (7e's review, A1-1)", () => {
    const names = ["#a", "#b", "#c", "#d", "#e", "#f"];
    fc.assert(
      fc.property(
        fc.array(fc.nat({ max: 40 }), { minLength: 6, maxLength: 6 }),
        fc.constantFrom(...names),
        (counts, current) => {
          const still = rooms(...names.map((room, at) => [room, counts[at] ?? 0] as const));
          let moons = nextMoons(undefined, still, { current, now: T0 });
          const first = [...moons.rooms].sort().join();
          for (let at = T0; at < T0 + 30 * 60_000; at += 20_000) moons = nextMoons(moons, still, { current, now: at });
          expect([...moons.rooms].sort().join()).toBe(first);
        },
      ),
    );
  });

  it("takes the busy rooms at once when the list comes after an empty first look (A1-2)", () => {
    const empty = nextMoons(undefined, [], { current: undefined, now: T0 });
    const listed = nextMoons(empty, rooms(["#w", 2], ["#w/a", 9], ["#w/b", 8], ["#w/c", 7]), {
      current: "#w",
      now: T0 + 1_000,
    });
    expect(listed.rooms).toHaveLength(MOONS_MAX);
  });

  it("fills a free place at the next change, without the hold a moon's place asks (A1-3)", () => {
    const start = nextMoons(undefined, rooms(["#a", 9], ["#b", 8], ["#c", 0]), { current: undefined, now: T0 });
    const busy = rooms(["#a", 9], ["#b", 8], ["#c", 3]);
    expect(nextMoons(start, busy, { current: undefined, now: T0 + MOON_SET_MS }).rooms).toContain("#c");
  });

  it("lets a moon nobody is in leave at the next change (A1-3)", () => {
    const start = nextMoons(undefined, rooms(["#a", 9], ["#b", 8]), { current: undefined, now: T0 });
    const quiet = rooms(["#a", 9], ["#b", 0]);
    expect(nextMoons(start, quiet, { current: undefined, now: T0 + 1_000 }).rooms).toContain("#b");
    expect(nextMoons(start, quiet, { current: undefined, now: T0 + MOON_SET_MS }).rooms).toEqual(["#a"]);
  });

  it("keeps four at most, no room twice and yours in, minute after minute (A1-3)", () => {
    const names = ["#a", "#b", "#c", "#d", "#e", "#f", "#g"];
    fc.assert(
      fc.property(
        fc.array(fc.array(fc.nat({ max: 30 }), { minLength: 7, maxLength: 7 }), { minLength: 1, maxLength: 40 }),
        (steps) => {
          let moons: Moons | undefined;
          steps.forEach((counts, step) => {
            moons = nextMoons(moons, rooms(...names.map((room, at) => [room, counts[at] ?? 0] as const)), {
              current: "#g",
              now: T0 + step * 70_000,
            });
            expect(moons.rooms.length).toBeLessThanOrEqual(MOONS_MAX);
            expect(new Set(moons.rooms).size).toBe(moons.rooms.length);
            expect(moons.rooms).toContain("#g");
          });
        },
      ),
    );
  });

  it("lets a room that left the list leave at once", () => {
    const moons = nextMoons(undefined, rooms(["#a", 9], ["#b", 8]), { current: undefined, now: T0 });
    expect(nextMoons(moons, rooms(["#a", 9]), { current: undefined, now: T0 + 1_000 }).rooms).toEqual(["#a"]);
  });

  it("never holds more than four moons, nor a room twice", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom("#a", "#b", "#c", "#d", "#e", "#f"), fc.nat({ max: 100 })), {
          maxLength: 12,
        }),
        fc.option(fc.constantFrom("#a", "#f", "#z"), { nil: undefined }),
        (counts, current) => {
          const moons = nextMoons(undefined, rooms(...counts), { current: current, now: T0 });
          expect(moons.rooms.length).toBeLessThanOrEqual(MOONS_MAX);
          expect(new Set(moons.rooms).size).toBe(moons.rooms.length);
          const later = nextMoons(moons, rooms(...counts), { current: current, now: T0 + 5_000 });
          if (current !== undefined && counts.some(([room]) => room === current)) {
            expect(moons.rooms).toContain(current);
            expect(later.rooms).toContain(current);
          }
        },
      ),
    );
  });
});

describe("moonSize", () => {
  it("grows with the people present on a log scale, a quiet room still a little moon and the busiest capped", () => {
    expect(moonSize(1, 100)).toBeGreaterThan(0);
    expect(moonSize(10, 100)).toBeGreaterThan(moonSize(1, 100));
    expect(moonSize(100, 100)).toBe(1);
    expect(moonSize(1000, 100)).toBe(1);
    expect(moonSize(10, 100) - moonSize(1, 100)).toBeGreaterThan(moonSize(100, 100) - moonSize(91, 100));
  });

  it("follows the people's logarithm against the busiest room, from a smallest moon up", () => {
    expect(moonSize(10, 100)).toBeCloseTo(MOON_SMALLEST + (1 - MOON_SMALLEST) * presenceOf(10, 100), 12);
    expect(moonSize(0, 100)).toBe(MOON_SMALLEST);
  });

  it("stays a share whatever it is handed", () => {
    fc.assert(
      fc.property(fc.double(), fc.double(), (people, busiest) => {
        const size = moonSize(people, busiest);
        expect(size).toBeGreaterThan(0);
        expect(size).toBeLessThanOrEqual(1);
      }),
    );
  });
});
