import { anchorOf, asciiBytes, planetSeed, presenceOf, worldLook, worldSigns } from "@gnoworld/core";
import type { Worlds } from "@gnoworld/schemas/indexer";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { readingOf, type WorldNow } from "./reading.ts";

const weighed = vi.hoisted(() => ({ count: 0 }));
vi.mock("@gnoworld/core", async (original) => {
  const real = await original<typeof import("@gnoworld/core")>();
  return {
    ...real,
    referenceOf: (...args: Parameters<typeof real.referenceOf>) => {
      weighed.count += 1;
      return real.referenceOf(...args);
    },
  };
});

// A world's page reads each sign from its own data (ADR-0002 §3 and §10): the people present are its heat and light, its realms' calls its
// aurora, its rooms' lines its storms, the worlds' file its matter. Nothing else lights a sign: a world with no data carries none.
const NOW = Date.parse("2026-11-02T12:00:00Z");
const DAY = 86_400_000;
const realm = (path: string, more: Partial<Worlds["worlds"][number]["realms"][number]> = {}) => ({
  path,
  deployer: null,
  deployerName: null,
  functions: [],
  imports: [],
  calls: null,
  callers: null,
  lastHeight: null,
  ...more,
});
const fileOf = (...worlds: Worlds["worlds"]): Worlds => ({
  version: 1,
  universe: "onyx",
  updated: "2026-11-02T11:55:00Z",
  worlds,
});
const quietFile = () =>
  fileOf(
    { id: "gov/dao", namespace: "gov", realms: [realm("gno.land/r/gov/dao")], seen: "2026-01-01T00:00:00Z" },
    ...Array.from({ length: 40 }, (_, at) => ({
      id: `n${String(at)}/w`,
      namespace: `n${String(at)}`,
      realms: [realm(`gno.land/r/n${String(at)}/w`, { calls: at, callers: at % 7, lastHeight: 1000 + at })],
    })),
  );
const quiet = (more: Partial<WorldNow> = {}): WorldNow => ({
  universe: "onyx",
  id: "gov/dao",
  people: 0,
  lines: [],
  visited: true,
  now: NOW,
  ...more,
});

// A universe of 40 namespaces whose busiest call at `top` callers, each world's callers its place on the way up, times `scale`.
const universeOf = (scale: number, govdao: number) =>
  fileOf(
    { id: "gov/dao", namespace: "gov", realms: [realm("gno.land/r/gov/dao", { callers: govdao * scale })] },
    ...Array.from({ length: 40 }, (_, at) => ({
      id: `n${String(at)}/w`,
      namespace: `n${String(at)}`,
      realms: [realm(`gno.land/r/n${String(at)}/w`, { callers: at * 3 * scale })],
    })),
  );
// The worlds' file the job wrote on 2026-11-01 for onyx (app/lab/worlds.json): 533 worlds, and no realm with a count.
const RECORDED: Worlds = JSON.parse(
  readFileSync(new URL("../../../lab/worlds.json", import.meta.url), "utf8"),
) as Worlds;

// A world's size by its use against its universe (F4307; ADR-0002 §3, on a log scale relative to the universe): its realms' callers against
// the 95th percentile of its universe's namespaces, with no floor, so the busiest reach the top and the quietest the bottom whatever the
// counts; none while the universe's file carries no count at all, for quiet cannot be told from unknown.
describe("a world's use against its universe", () => {
  it("puts the universe's busiest at the top and its quietest at the bottom, and the same ten times busier", () => {
    for (const scale of [1, 10]) {
      expect(readingOf(universeOf(scale, 500), quiet()).used, `the busiest, times ${String(scale)}`).toBe(1);
      expect(readingOf(universeOf(scale, 0), quiet()).used, `the quietest, times ${String(scale)}`).toBe(0);
      const middle = readingOf(universeOf(scale, 20), quiet()).used ?? -1;
      expect(middle).toBeGreaterThan(0);
      expect(middle).toBeLessThan(1);
    }
  });

  it("reads no use from a universe whose file carries no count, as the real file of 2026-11-01, for GovDAO and for Bubble", () => {
    expect(
      RECORDED.worlds.every(({ realms }) => realms.every(({ callers, calls }) => callers === null && calls === null)),
    ).toBe(true);
    expect(readingOf(RECORDED, quiet()).used).toBeUndefined();
    expect(readingOf(RECORDED, quiet({ id: "bubble", people: 2 })).used).toBeUndefined();
    expect(readingOf(undefined, quiet()).used).toBeUndefined();
  });

  it("reads a world its universe's file does not list as the quietest once the file carries counts", () => {
    expect(readingOf(universeOf(1, 500), quiet({ id: "bubble" })).used).toBe(0);
  });
});

describe("readingOf", () => {
  it("draws the world as the cosmos does: the same look from the same id", () => {
    const reading = readingOf(quietFile(), quiet());
    expect(reading.look).toEqual(worldLook("gov/dao"));
  });

  it("lights nothing on a quiet world at rest: no heat, no aurora, no storm, no seed's glow", () => {
    const reading = readingOf(quietFile(), quiet());
    expect(reading.heat).toBe(0);
    expect(reading.aurora).toBe(0);
    expect(reading.storms).toEqual([0, 0, 0]);
    expect(reading.signs.signal).toBe(0);
    expect(reading.signs.lights.level).toBeCloseTo(0.35, 12);
  });

  it("warms the world with the people present, and lights its night by them", () => {
    const empty = readingOf(quietFile(), quiet());
    const crowded = readingOf(quietFile(), quiet({ people: 20 }));
    expect(crowded.heat).toBeGreaterThan(0);
    expect(crowded.signs.lights.level).toBeGreaterThan(empty.signs.lights.level);
  });

  it("raises an aurora only on a run of calls to its own realms, read from the file", () => {
    const newest = 5000;
    const busy = fileOf(
      {
        id: "gov/dao",
        namespace: "gov",
        realms: [realm("gno.land/r/gov/dao", { calls: 400, callers: 30, lastHeight: newest })],
      },
      {
        id: "x/y",
        namespace: "x",
        realms: [realm("gno.land/r/x/y", { calls: 9, callers: 2, lastHeight: newest - 10 })],
      },
    );
    expect(readingOf(busy, quiet()).aurora).toBeGreaterThan(0);
    expect(readingOf(busy, quiet({ id: "bubble" })).aurora).toBe(0);
  });

  it("counts every realm of the world: their calls added, the last of their calls the run's", () => {
    const newest = 9000;
    const two = (last: number) =>
      fileOf(
        {
          id: "gov/dao",
          namespace: "gov",
          realms: [
            realm("gno.land/r/gov/dao", { calls: 30, lastHeight: 100 }),
            realm("gno.land/r/gov/dao/v2", { calls: 30, lastHeight: last }),
          ],
        },
        { id: "x/y", namespace: "x", realms: [realm("gno.land/r/x/y", { calls: 600, lastHeight: newest })] },
      );
    const one = fileOf(
      { id: "gov/dao", namespace: "gov", realms: [realm("gno.land/r/gov/dao", { calls: 60, lastHeight: newest })] },
      { id: "x/y", namespace: "x", realms: [realm("gno.land/r/x/y", { calls: 600, lastHeight: newest })] },
    );
    expect(readingOf(two(newest), quiet()).aurora).toBeCloseTo(readingOf(one, quiet()).aurora, 12);
    expect(readingOf(two(newest), quiet()).aurora).toBeGreaterThan(0);
  });

  it("reads the chain's height at the newest call of any world, not the first world's (B1-4)", () => {
    const file = fileOf(
      { id: "gov/dao", namespace: "gov", realms: [realm("gno.land/r/gov/dao", { calls: 400, lastHeight: 1000 })] },
      { id: "x/y", namespace: "x", realms: [realm("gno.land/r/x/y", { calls: 9, lastHeight: 5000 })] },
    );
    expect(readingOf(file, quiet()).aurora).toBe(0);
  });

  it("lets the aurora fade with a file that has not been written again: an old run is no run", () => {
    const run = (updated: string) => ({
      ...fileOf({
        id: "gov/dao",
        namespace: "gov",
        realms: [realm("gno.land/r/gov/dao", { calls: 400, lastHeight: 5000 })],
      }),
      updated,
    });
    expect(readingOf(run("2026-11-02T11:59:00Z"), quiet()).aurora).toBeGreaterThan(0);
    expect(readingOf(run("2026-11-02T08:00:00Z"), quiet()).aurora).toBe(0);
  });

  it("lets no world called a million times dim every other world's aurora (F4111, on calls)", () => {
    const withTop = (top: number) =>
      fileOf(
        { id: "gov/dao", namespace: "gov", realms: [realm("gno.land/r/gov/dao", { calls: 40, lastHeight: 5000 })] },
        ...Array.from({ length: 60 }, (_, at) => ({
          id: `n${String(at)}/w`,
          namespace: `n${String(at)}`,
          realms: [realm(`gno.land/r/n${String(at)}/w`, { calls: at === 0 ? top : at, lastHeight: 4000 })],
        })),
      );
    expect(readingOf(withTop(1e6), quiet()).aurora).toBe(readingOf(withTop(59), quiet()).aurora);
  });

  it("lets no owner of many worlds move another's aurora or use: a namespace counts once (security review, S1)", () => {
    const honest = Array.from({ length: 40 }, (_, at) => ({
      id: `n${String(at)}/w`,
      namespace: `n${String(at)}`,
      realms: [realm(`gno.land/r/n${String(at)}/w`, { calls: at * 3, callers: at % 9, lastHeight: 4990 })],
    }));
    const ours = {
      id: "gov/dao",
      namespace: "gov",
      realms: [realm("gno.land/r/gov/dao", { calls: 90, callers: 7, lastHeight: 5000 })],
    };
    const owned = Array.from({ length: 30 }, (_, at) => ({
      id: `sybil/w${String(at)}`,
      namespace: "sybil",
      realms: [realm(`gno.land/r/sybil/w${String(at)}`, { calls: 1e9, callers: 1e6, lastHeight: 4995 })],
    }));
    // Thirty worlds of one owner weigh as one of them would: any new namespace moves a percentile by one rank, and no more.
    const one = readingOf(fileOf(ours, ...honest, ...owned.slice(0, 1)), quiet());
    const flooded = readingOf(fileOf(ours, ...honest, ...owned), quiet());
    expect(flooded.aurora).toBeCloseTo(one.aurora, 12);
    expect(flooded.vitality).toBeCloseTo(one.vitality, 12);
    expect(flooded.aurora).toBeGreaterThan(0);
  });

  it("reads a file of another universe as no file: a world's page never takes the wrong chain's counts", () => {
    const busy = fileOf({
      id: "gov/dao",
      namespace: "gov",
      realms: [realm("gno.land/r/gov/dao", { calls: 400, callers: 50, lastHeight: 5000 })],
    });
    expect(readingOf(busy, quiet({ universe: "gnoland" }))).toEqual(
      readingOf(undefined, quiet({ universe: "gnoland" })),
    );
  });

  it("weighs the universe once a file, however many times a world is read", () => {
    const file = quietFile();
    weighed.count = 0;
    for (let at = 0; at < 50; at += 1) readingOf(file, quiet({ people: at }));
    expect(weighed.count).toBeGreaterThan(0);
    expect(weighed.count).toBeLessThanOrEqual(2);
  });

  it("warms by the people present on the ladder that starts at 31", () => {
    expect(readingOf(quietFile(), quiet({ people: 7 })).heat).toBeCloseTo(presenceOf(7, 0), 12);
  });

  it("raises storms from its rooms' lines alone", () => {
    const lines = Array.from({ length: 30 }, (_, at) => NOW - at * 5000);
    expect(readingOf(quietFile(), quiet({ lines })).storms[0]).toBeGreaterThan(0);
  });

  it("keeps a new family a seed until this reader's first visit, and wakes it on that visit", () => {
    const file = fileOf({
      id: "mint/fresh",
      namespace: "mint",
      realms: [realm("gno.land/r/mint/fresh")],
      seen: new Date(NOW - 2 * DAY).toISOString(),
    });
    const first = readingOf(file, quiet({ id: "mint/fresh", visited: false }));
    expect(first.signs.stage).toBe("seed");
    expect(first.wake).toBe(true);
    const again = readingOf(file, quiet({ id: "mint/fresh", visited: true }));
    expect(again.signs.stage).not.toBe("seed");
    expect(again.wake).toBe(false);
  });

  it("keeps a world a seed through its seventh day, and no longer: 6 days 23 hours, then 7 days", () => {
    const aged = (days: number) =>
      readingOf(
        fileOf({
          id: "mint/a",
          namespace: "mint",
          realms: [realm("gno.land/r/mint/a")],
          seen: new Date(NOW - days * DAY).toISOString(),
        }),
        quiet({ id: "mint/a", visited: false }),
      ).signs.stage;
    expect(aged(6 + 23 / 24)).toBe("seed");
    expect(aged(7)).not.toBe("seed");
  });

  it("never calls a world seen in the future a seed, nor one missing from the file", () => {
    const future = fileOf({
      id: "mint/b",
      namespace: "mint",
      realms: [realm("gno.land/r/mint/b")],
      seen: new Date(NOW + DAY).toISOString(),
    });
    expect(readingOf(future, quiet({ id: "mint/b", visited: false })).wake).toBe(false);
    expect(readingOf(quietFile(), quiet({ id: "mint/none", visited: false })).wake).toBe(false);
  });

  it("never calls a world of unknown age a seed, nor one past its seventh day", () => {
    const old = fileOf({
      id: "mint/old",
      namespace: "mint",
      realms: [realm("gno.land/r/mint/old")],
      seen: new Date(NOW - 8 * DAY).toISOString(),
    });
    expect(readingOf(old, quiet({ id: "mint/old", visited: false })).wake).toBe(false);
    expect(readingOf(undefined, quiet({ id: "bubble", visited: false })).signs.stage).not.toBe("seed");
  });

  it("reads a world missing from the file, a hub with no realm, from its people alone", () => {
    const reading = readingOf(quietFile(), quiet({ id: "bubble", people: 12 }));
    const seed = planetSeed(asciiBytes("gno.land/r/bubble"));
    expect(reading.signs).toEqual(
      worldSigns(seed, anchorOf(seed, null), { vitality: reading.vitality, present: reading.heat, fresh: false }),
    );
    expect(reading.vitality).toBeGreaterThan(0);
  });

  it("weighs one world's use against the universe's 95th percentile, so one sybil world moves no other (F4111)", () => {
    const counts = (sybil: number) =>
      fileOf(
        { id: "gov/dao", namespace: "gov", realms: [realm("gno.land/r/gov/dao", { callers: 9 })] },
        ...Array.from({ length: 60 }, (_, at) => ({
          id: `n${String(at)}/w`,
          namespace: `n${String(at)}`,
          realms: [realm(`gno.land/r/n${String(at)}/w`, { callers: at === 0 ? sybil : at % 12 })],
        })),
      );
    expect(readingOf(counts(1023), quiet()).vitality).toBe(readingOf(counts(11), quiet()).vitality);
    expect(readingOf(counts(11), quiet()).vitality).toBeGreaterThan(0);
  });
});
