import { describe, expect, it } from "vitest";
import { RealmRollup, ROLLUP_CAPS, ROLLUP_MAX_GZIP } from "./realmRollup.ts";

// A realm's rollup (slice 13a): the file the worlds job writes for each realm beside worlds.json, and the plate reads with this schema.
// Everything in it came from a chain or its indexer: every list is capped, every count whole, every text checked. The file the job wrote
// from onyx-1 is read against it in server/src/worlds/rollup.test.ts.
const CALLER = "g1e3vld469ekks28mhtd4aqua3mdaz64qgdtz29k";
const file = (over: Record<string, unknown> = {}) => ({
  version: 1,
  universe: "onyx",
  path: "gno.land/r/gnops/valopers",
  updated: "2026-11-10T10:00:00.000Z",
  height: 1_015_429,
  calls: 3,
  callers: 1,
  days: [{ day: "2026-09-29", calls: 3, callers: 1 }],
  top: [{ address: CALLER, calls: 3 }],
  last: [{ func: "Register", caller: CALLER, height: 34_657, success: true, time: "2026-09-29T10:00:00.123456789Z" }],
  importers: { total: 1, top: [{ path: "gno.land/r/gnops/valopers/proposal", calls: 2 }] },
  functions: [{ name: "Register", calls: 3 }],
  ...over,
});
const parses = (value: unknown): boolean => RealmRollup.safeParse(value).success;
const many = <T>(count: number, each: (i: number) => T): T[] => Array.from({ length: count }, (_, i) => each(i));

describe("RealmRollup, a realm's rollup file", () => {
  it("takes a whole file", () => {
    expect(RealmRollup.safeParse(file()).error).toBeUndefined();
  });

  it("caps its lists as the plan states them: 400 days, 20 callers, 100 calls, 100 importers, 100 functions", () => {
    expect(ROLLUP_CAPS).toEqual({ days: 400, callers: 20, last: 100, importers: 100, functions: 100 });
    expect(ROLLUP_MAX_GZIP).toBe(8192);
    const day = (i: number) => new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
    const lists = {
      days: (n: number) => many(n, (i) => ({ day: day(i), calls: 1, callers: 1 })),
      top: (n: number) => many(n, () => ({ address: CALLER, calls: 1 })),
      last: (n: number) => many(n, () => ({ func: null, caller: null, height: 1, success: false, time: null })),
      functions: (n: number) => many(n, () => ({ name: "Register", calls: 1 })),
    };
    const caps = { days: 400, top: 20, last: 100, functions: 100 } as const;
    for (const [key, cap] of Object.entries(caps) as [keyof typeof lists, number][]) {
      expect(parses(file({ [key]: lists[key](cap) })), key).toBe(true);
      expect(parses(file({ [key]: lists[key](cap + 1) })), key).toBe(false);
    }
    const importers = (n: number) => ({ total: 500, top: many(n, () => ({ path: "gno.land/r/a/b", calls: 1 })) });
    expect(parses(file({ importers: importers(100) }))).toBe(true);
    expect(parses(file({ importers: importers(101) }))).toBe(false);
  });

  it("refuses a key it does not know, a text that is no address, path, function or UTC day, and a count that is not whole", () => {
    expect(parses({ ...file(), extra: 1 })).toBe(false);
    expect(parses(file({ path: "gno.land/p/nt/avl/v0" }))).toBe(false);
    expect(parses(file({ top: [{ address: "<script>", calls: 1 }] }))).toBe(false);
    expect(parses(file({ last: [{ func: "x();", caller: null, height: 1, success: true, time: null }] }))).toBe(false);
    expect(parses(file({ days: [{ day: "2026-13-01", calls: 1, callers: 1 }] }))).toBe(false);
    expect(parses(file({ days: [{ day: "2026-09-29T00:00:00Z", calls: 1, callers: 1 }] }))).toBe(false);
    expect(parses(file({ calls: 1.5 }))).toBe(false);
    expect(parses(file({ callers: -1 }))).toBe(false);
    expect(parses(file({ importers: { total: 0, top: [{ path: "javascript:alert(1)", calls: 1 }] } }))).toBe(false);
    const lastCall = (over: Record<string, unknown>) => ({
      last: [{ func: "Register", caller: CALLER, height: 1, success: true, time: "2026-09-29T10:00:00.000Z", ...over }],
    });
    for (const time of ["<script>", "29/09/2026", "2026-09-29T10:00:00", "2026-09-29"])
      expect(parses(file(lastCall({ time }))), time).toBe(false);
    expect(parses(file(lastCall({ caller: "javascript:alert(1)" })))).toBe(false);
    expect(parses(file(lastCall({ success: "true" })))).toBe(false);
    expect(parses(file(lastCall({ height: -1 })))).toBe(false);
    expect(parses(file({ functions: [{ name: "x();", calls: 1 }] }))).toBe(false);
    expect(parses(file({ universe: "Onyx One" }))).toBe(false);
    expect(parses(file({ version: 2 }))).toBe(false);
    expect(parses(file({ height: 1.5 }))).toBe(false);
    expect(parses(file({ height: -1 }))).toBe(false);
    expect(parses(file({ top: [{ address: CALLER, calls: -1 }] }))).toBe(false);
    expect(parses(file({ importers: { total: -1, top: [] } }))).toBe(false);
  });

  it("keeps a call whose function, caller or time was not read as null, never a made-up value", () => {
    expect(parses(file({ last: [{ func: null, caller: null, height: 7, success: false, time: null }] }))).toBe(true);
  });
});
