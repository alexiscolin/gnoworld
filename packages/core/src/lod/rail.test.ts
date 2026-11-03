import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Signals } from "./labels.ts";
import { AHEAD, chooseRail, RAIL_MOST, RISING_MOST, SEEDS_MOST, type RailAsk, type RailWorld } from "./rail.ts";

// The rail (ADR-0002 §1's row, §10; plan §9, question 7): the Earth first, then the trends, the rising worlds and the seeds, each world once,
// 25 at most; its order changes only when a world is clearly ahead of the one shown above it.
const ADDRESS = "g1um2pwwnx3gn8p3ryfdert8mhpu4u4up49sc9ru";
const EARTH: RailAsk = { id: "earth", kind: "earth", signals: { here: 4 } };
const world = (id: string, signals: Signals, extra: Partial<RailAsk> = {}): RailAsk => ({
  id,
  kind: "far",
  signals,
  ...extra,
});
const trend = (id: string, here: number) => world(id, { here });
const rising = (id: string, rise: number, here = 10) => world(id, { here, rise });
const seed = (id: string, days: number, here = 0) => world(id, { here, uncharted: true }, { days });
const ids = (asks: readonly RailAsk[], shown?: readonly string[]) => chooseRail(asks, shown).map(({ id }) => id);
const sections = (asks: readonly RailAsk[]) => chooseRail(asks).map(({ section }) => section);
const many = (count: number, make: (index: number) => RailAsk) => Array.from({ length: count }, (_, at) => make(at));

describe("the rail's order", () => {
  it("puts the Earth first, then the trends, the rising worlds and the seeds, whatever order they come in", () => {
    const asks = [seed("fresh", 1), rising("climb", 0.5), trend("busy", 30), EARTH, trend("calm", 3)];
    expect(ids(asks)).toEqual(["earth", "busy", "calm", "climb", "fresh"]);
    expect(sections(asks)).toEqual(["earth", "trend", "trend", "rising", "seed"]);
  });

  it("ranks the trends by the people here now, the most first", () => {
    expect(ids([EARTH, trend("a", 2), trend("b", 40), trend("c", 9)])).toEqual(["earth", "b", "c", "a"]);
  });

  it("ranks two trends with as many people here by their ids, so the order they come in moves nothing", () => {
    expect(ids([EARTH, trend("zed", 5), trend("ada", 5)])).toEqual(["earth", "ada", "zed"]);
    expect(ids([EARTH, trend("ada", 5), trend("zed", 5)])).toEqual(["earth", "ada", "zed"]);
  });

  it("shows a rising world among the rising, never among the trends, though people are here", () => {
    const rail = chooseRail([EARTH, trend("calm", 3), rising("climb", 0.3, 50)]);
    expect(rail.map(({ id, section }) => [id, section])).toEqual([
      ["earth", "earth"],
      ["calm", "trend"],
      ["climb", "rising"],
    ]);
  });

  it("ranks the rising worlds by their rise, the most first", () => {
    expect(ids([EARTH, rising("a", 0.25), rising("b", 1.5), rising("c", 0.6)])).toEqual(["earth", "b", "c", "a"]);
  });

  it("shows a new world nobody here visited among the seeds, though it rises or people are here, the newest first", () => {
    const asks = [
      EARTH,
      seed("old", 6, 20),
      seed("young", 0),
      world("both", { here: 9, rise: 2, uncharted: true }, { days: 3 }),
    ];
    expect(ids(asks)).toEqual(["earth", "young", "both", "old"]);
    expect(sections(asks)).toEqual(["earth", "seed", "seed", "seed"]);
  });

  it("leaves out a world with nobody here, no rise and nothing new: a sign always means real data", () => {
    expect(ids([EARTH, world("quiet", {}), world("used", { use: 40 }), trend("empty", 0)])).toEqual(["earth"]);
  });

  it("lists each world once", () => {
    expect(ids([EARTH, trend("a", 3), trend("a", 3), EARTH])).toEqual(["earth", "a"]);
  });

  it("reads a world from its first ask, though a later one says more", () => {
    expect(ids([EARTH, world("a", {}), trend("a", 9)])).toEqual(["earth"]);
  });

  it("holds no Earth when none is asked for", () => {
    expect(ids([trend("a", 3)])).toEqual(["a"]);
  });

  it("keeps the Earth with nobody on it", () => {
    expect(ids([{ id: "earth", kind: "earth" }, trend("a", 3)])).toEqual(["earth", "a"]);
  });
});

describe("the rail's cap", () => {
  it("holds 25 at most, the Earth one of them", () => {
    const rail = chooseRail([EARTH, ...many(100, (at) => trend(`t${String(at)}`, 100 + at))]);
    expect(RAIL_MOST).toBe(25);
    expect(rail).toHaveLength(RAIL_MOST);
    expect(rail[0]?.id).toBe("earth");
    expect(rail[1]?.id).toBe("t99");
  });

  it("keeps room for 8 rising worlds and 4 seeds when the trends would fill it", () => {
    const asks = [
      EARTH,
      ...many(30, (at) => trend(`t${String(at)}`, 100 + at)),
      ...many(10, (at) => rising(`r${String(at)}`, 1 + at)),
      ...many(6, (at) => seed(`s${String(at)}`, at)),
    ];
    const count = (section: string) => chooseRail(asks).filter((each) => each.section === section).length;
    expect([RISING_MOST, SEEDS_MOST]).toEqual([8, 4]);
    expect([count("earth"), count("trend"), count("rising"), count("seed")]).toEqual([1, 12, 8, 4]);
  });

  it("gives the trends the room the rising worlds and the seeds leave", () => {
    const asks = [EARTH, ...many(30, (at) => trend(`t${String(at)}`, 100 + at)), rising("r", 1), seed("s", 0)];
    const rail = chooseRail(asks);
    expect(rail).toHaveLength(RAIL_MOST);
    expect(rail.filter(({ section }) => section === "trend")).toHaveLength(RAIL_MOST - 3);
  });

  it("never holds more than 8 rising worlds nor 4 seeds, though the trends leave room", () => {
    const asks = [
      EARTH,
      ...many(12, (at) => rising(`r${String(at)}`, 1 + at)),
      ...many(9, (at) => seed(`s${String(at)}`, at)),
    ];
    expect(sections(asks)).toEqual([
      "earth",
      ...Array<string>(RISING_MOST).fill("rising"),
      ...Array<string>(SEEDS_MOST).fill("seed"),
    ]);
    expect(ids(asks).slice(1, 3)).toEqual(["r11", "r10"]);
    expect(ids(asks).slice(-SEEDS_MOST)).toEqual(["s0", "s1", "s2", "s3"]);
  });

  it("holds every rule on any list: the Earth first, sections in order and ranked, each world once, within every cap", () => {
    const IDS = Array.from({ length: 40 }, (_, at) => `w${String(at)}`);
    const anyWorld = fc.record({
      id: fc.constantFrom(...IDS),
      kind: fc.constant("far" as const),
      signals: fc.record(
        { here: fc.nat({ max: 500 }), rise: fc.double({ min: 0.21, max: 20, noNaN: true }), uncharted: fc.boolean() },
        { requiredKeys: [] },
      ),
      days: fc.nat({ max: 6 }),
    });
    const order = ["earth", "trend", "rising", "seed"];
    const scoreOf = ({ signals, days = 0 }: RailAsk, section: string) =>
      ({ trend: signals?.here, rising: signals?.rise, seed: -days })[section] ?? 0;
    const isTrend = ({ signals }: RailAsk) =>
      signals?.uncharted !== true && signals?.rise === undefined && (signals?.here ?? 0) > 0;
    // Within a section, no world stands just below one it is clearly ahead of.
    const held = (rail: readonly RailWorld[], asks: ReadonlyMap<string, RailAsk>, section: string) => {
      const scores = rail
        .filter((each) => each.section === section)
        .map(({ id }) => scoreOf(asks.get(id) ?? EARTH, section));
      return scores.every((score, at) => at === 0 || !(score > AHEAD * (scores[at - 1] ?? 0)));
    };
    fc.assert(
      fc.property(
        fc.uniqueArray(anyWorld, { selector: ({ id }) => id, maxLength: 40 }),
        fc.shuffledSubarray(IDS),
        (worlds, shown) => {
          const asks = [EARTH, ...worlds];
          const rail = chooseRail(asks, shown);
          const kinds = rail.map(({ section }) => order.indexOf(section));
          const count = (kind: number) => kinds.filter((each) => each === kind).length;
          expect(rail.length).toBeLessThanOrEqual(RAIL_MOST);
          expect(new Set(rail.map(({ id }) => id)).size).toBe(rail.length);
          expect(kinds).toEqual([...kinds].sort((a, b) => a - b));
          expect(rail[0]?.section).toBe("earth");
          expect(count(2)).toBeLessThanOrEqual(RISING_MOST);
          expect(count(3)).toBeLessThanOrEqual(SEEDS_MOST);
          // The trends fill what the others leave, as far as there are trends.
          expect(count(1)).toBe(Math.min(worlds.filter(isTrend).length, RAIL_MOST - 1 - count(2) - count(3)));
          const byId = new Map<string, RailAsk>(worlds.map((ask) => [ask.id, ask]));
          expect(held(rail, byId, "trend") && held(rail, byId, "rising")).toBe(true);
          // The same rail whatever order the asks come in.
          expect(chooseRail([EARTH, ...[...worlds].reverse()], shown)).toEqual(rail);
        },
      ),
    );
  });
});

describe("the rail's order held", () => {
  it("keeps the order shown while no world is clearly ahead of the one above it", () => {
    expect(AHEAD).toBe(1.25);
    expect(ids([EARTH, trend("a", 10), trend("b", 12)], ["earth", "a", "b"])).toEqual(["earth", "a", "b"]);
  });

  it("moves a world up once it is clearly ahead", () => {
    expect(ids([EARTH, trend("a", 10), trend("b", 13)], ["earth", "a", "b"])).toEqual(["earth", "b", "a"]);
  });

  it("lifts a world past several it is clearly ahead of, and stops under the first it is not", () => {
    const shown = ["earth", "a", "b", "c", "d"];
    const asks = [EARTH, trend("a", 30), trend("b", 10), trend("c", 9), trend("d", 26)];
    expect(ids(asks, shown)).toEqual(["earth", "a", "d", "b", "c"]);
  });

  it("holds the rising worlds as it holds the trends", () => {
    const shown = ["earth", "a", "b"];
    expect(ids([EARTH, rising("a", 1), rising("b", 1.2)], shown)).toEqual(["earth", "a", "b"]);
    expect(ids([EARTH, rising("a", 1), rising("b", 2)], shown)).toEqual(["earth", "b", "a"]);
  });

  it("puts a world it did not show after those it showed, unless it is clearly ahead", () => {
    const shown = ["earth", "a"];
    expect(ids([EARTH, trend("a", 10), trend("new", 11)], shown)).toEqual(["earth", "a", "new"]);
    expect(ids([EARTH, trend("a", 10), trend("new", 40)], shown)).toEqual(["earth", "new", "a"]);
  });

  it("keeps the order at exactly AHEAD times, and moves it just past", () => {
    expect(ids([EARTH, trend("a", 8), trend("b", 10)], ["earth", "a", "b"])).toEqual(["earth", "a", "b"]);
    expect(ids([EARTH, trend("a", 8), trend("b", 10.01)], ["earth", "a", "b"])).toEqual(["earth", "b", "a"]);
  });

  it("keeps no place for a world shown before that the cap now leaves out", () => {
    const shown = ["earth", "old", ...many(23, (at) => trend(`t${String(at)}`, 0)).map(({ id }) => id)];
    const asks = [EARTH, trend("old", 1), ...many(30, (at) => trend(`t${String(at)}`, 50 + at))];
    expect(ids(asks, shown)).not.toContain("old");
    expect(ids(asks, shown)).toHaveLength(RAIL_MOST);
  });

  it("keeps a world shown among the trends in its section once it rises, whatever order was shown", () => {
    const shown = ["earth", "climb", "calm"];
    expect(
      chooseRail([EARTH, rising("climb", 0.5, 3), trend("calm", 30)], shown).map(({ id, section }) => [id, section]),
    ).toEqual([
      ["earth", "earth"],
      ["calm", "trend"],
      ["climb", "rising"],
    ]);
  });

  it("ranks two rising worlds that rise as much by their ids, and two seeds as old", () => {
    expect(ids([EARTH, rising("zed", 0.5), rising("ada", 0.5)])).toEqual(["earth", "ada", "zed"]);
    expect(ids([EARTH, seed("zed", 2), seed("ada", 2)])).toEqual(["earth", "ada", "zed"]);
  });

  it("drops a world shown before that no longer trends", () => {
    expect(ids([EARTH, trend("b", 4)], ["earth", "a", "b"])).toEqual(["earth", "b"]);
  });
});

describe("a world's name on the rail", () => {
  it("is its label's: the name the data gives, else its last segment that holds no address", () => {
    const rail = chooseRail([
      EARTH,
      world("gov/dao", { here: 3 }, { name: "GovDAO" }),
      trend(`${ADDRESS}/minichess`, 2),
    ]);
    expect(rail.map(({ title }) => title)).toEqual(["Earth", "GovDAO", "minichess"]);
  });

  it("is an uncharted signal for a seed, unnamed till charted", () => {
    expect(chooseRail([EARTH, seed("demo/fresh", 1)])[1]?.title).toBe("Uncharted signal");
  });

  it("leaves out a world only an address names", () => {
    expect(ids([EARTH, trend(ADDRESS, 50)])).toEqual(["earth"]);
  });
});
