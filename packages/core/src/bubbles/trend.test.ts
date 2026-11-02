import { describe, expect, it } from "vitest";
import { countryTrends, MOST_TRENDS } from "./trend.ts";
import type { BubbleMessage } from "./types.ts";

// A country's pill on the globe (frames 39, 43 to 55, 85; ADR-0002 §1, "+15% · 1 h"): the last hour's lines of a country against the hour
// before, from the public lines the page holds. Signs mean real data: too few lines to compare, or a window that does not reach back two
// hours, shows no pill.
const NOW = Date.UTC(2026, 10, 2, 12, 0, 0);
const HOUR = 3_600_000;
const MINUTE = 60_000;

function line(n: number, at: number, over: Partial<BubbleMessage> = {}): BubbleMessage {
  const country = over.country ?? "JP";
  return {
    id: `${country}${String(n)}${String(at)}`,
    at,
    account: `a${String(n)}`,
    text: "hello",
    country,
    visibility: "public",
    joined: true,
    ...over,
  };
}
/** `recent` lines in the last hour and `before` in the hour before it, of one country. */
const hours = (country: string, [recent, before]: readonly [number, number], over: Partial<BubbleMessage> = {}) => [
  ...Array.from({ length: recent }, (_, n) => line(n, NOW - MINUTE * (n % 59) - 1000, { country, ...over })),
  ...Array.from({ length: before }, (_, n) => line(n, NOW - HOUR - MINUTE * (n % 59) - 1000, { country, ...over })),
];

describe("countryTrends", () => {
  it("says nothing of nothing", () => {
    expect(countryTrends([], NOW)).toEqual([]);
  });

  it("gives a country's last hour against the hour before, in whole percents, up and down", () => {
    expect(countryTrends(hours("JP", [23, 20]), NOW)).toEqual([{ country: "JP", percent: 15 }]);
    expect(countryTrends(hours("IN", [29, 30]), NOW)).toEqual([{ country: "IN", percent: -3 }]);
  });

  it("shows no pill for a change it cannot read: under eight lines in the hour before", () => {
    expect(countryTrends(hours("JP", [9, 7]), NOW)).toEqual([]);
    expect(countryTrends(hours("JP", [10, 8]), NOW)).toEqual([{ country: "JP", percent: 25 }]);
  });

  it("shows no pill for no change, nor for one that rounds to none", () => {
    expect(countryTrends(hours("JP", [8, 8]), NOW)).toEqual([]);
    expect(countryTrends(hours("JP", [300, 299]), NOW)).toEqual([]);
  });

  it("rounds to the nearest percent, a half away from zero on either side", () => {
    expect(countryTrends(hours("JP", [17, 12]), NOW)).toEqual([{ country: "JP", percent: 42 }]);
    expect(countryTrends(hours("JP", [7, 12]), NOW)).toEqual([{ country: "JP", percent: -42 }]);
    expect(countryTrends(hours("JP", [201, 200]), NOW)).toEqual([{ country: "JP", percent: 1 }]);
    expect(countryTrends(hours("JP", [199, 200]), NOW)).toEqual([{ country: "JP", percent: -1 }]);
  });

  it("takes a line of exactly an hour ago into the hour before, and of two hours ago into neither", () => {
    const edge = [
      ...Array.from({ length: 8 }, (_, n) => line(n, NOW - HOUR)),
      line(9, NOW),
      line(10, NOW - 2 * HOUR),
      line(11, NOW - 2 * HOUR - 1),
    ];
    expect(countryTrends(edge, NOW)).toEqual([{ country: "JP", percent: -88 }]);
  });

  it("does not count a line of the future, whatever the clock said", () => {
    expect(countryTrends([...hours("JP", [8, 8]), line(99, NOW + 1)], NOW)).toEqual([]);
  });

  it.each([
    ["a private room's", { visibility: "private" }],
    ["a direct message's", { visibility: "dm" }],
    ["a room not joined", { joined: false }],
    ["a hidden line's", { hidden: true }],
  ] as const)("counts none of %s lines", (_name, over) => {
    expect(countryTrends(hours("JP", [20, 10], over), NOW)).toEqual([]);
  });

  it("counts no line with no country, and no code the table does not hold", () => {
    const bare = hours("JP", [20, 10]).map((m) => {
      const copy = { ...m };
      delete copy.country;
      return copy;
    });
    expect(countryTrends(bare, NOW)).toEqual([]);
    expect(countryTrends(hours("ZZ", [20, 10]), NOW)).toEqual([]);
    expect(countryTrends(hours("__proto__", [20, 10]), NOW)).toEqual([]);
  });

  it("orders the largest change first, up or down, then by code, and keeps a pill for each of a few countries", () => {
    const lines = [
      ...hours("JP", [12, 10]),
      ...hours("FR", [5, 10]),
      ...hours("IN", [20, 10]),
      ...hours("BR", [12, 10]),
    ];
    expect(countryTrends(lines, NOW)).toEqual([
      { country: "IN", percent: 100 },
      { country: "FR", percent: -50 },
      { country: "BR", percent: 20 },
      { country: "JP", percent: 20 },
    ]);
  });

  it(`shows ${String(MOST_TRENDS)} pills at most, whatever the crowd: the globe stays clean`, () => {
    const codes = "JP FR IN BR US DE GB ES IT CA AU MX KR NL SE NO".split(" ");
    const crowd = codes.flatMap((code, n) => hours(code, [10 + n, 10]));
    const out = countryTrends(crowd, NOW);
    expect(out).toHaveLength(MOST_TRENDS);
    expect(out[0]?.country).toBe("NO");
  });

  it("counts a line once when two rooms hold its id", () => {
    const recent = hours("JP", [12, 0]);
    const before = hours("JP", [0, 10]);
    expect(countryTrends([...recent, ...recent, ...before], NOW)).toEqual([{ country: "JP", percent: 20 }]);
  });
});
