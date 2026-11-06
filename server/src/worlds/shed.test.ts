import { Worlds, WORLDS_CAPS } from "@gnoworld/schemas/indexer";
import { describe, expect, it } from "vitest";
import { fitted } from "./shed.ts";

// A file that breaks a cap is shed to fit, never refused whole: lists first, then whole worlds, the least active world first.
type Row = Worlds["worlds"][number];
const A = "g10ragdr3cjqkael8rslpw4y6rlelhev4h0fswcx";
const row = (ns: string, n: number, weight: number): Row => ({
  id: `${ns}/app`,
  namespace: ns,
  realms: Array.from({ length: n }, (_, i) => ({
    path: `gno.land/r/${ns}/app${String(i)}`,
    deployer: A,
    deployerName: null,
    functions: Array.from({ length: weight }, (_, f) => `Fn${String(f)}`),
    imports: [],
    calls: 1,
    callers: 1,
    lastHeight: 1,
  })),
});
const calling = (world: Row, calls: number | null): Row => ({
  ...world,
  realms: world.realms.map((realm) => ({ ...realm, calls })),
});
const head = { version: 1, universe: "onyx", updated: "2026-11-01T12:00:00.000Z" } as const;
const sizeOf = (worlds: Row[]): number => Buffer.byteLength(`${JSON.stringify({ ...head, worlds })}\n`);

describe("fitted", () => {
  const good = calling(row("good", 2, 3), 50);
  const fat = calling(row("fat", 5, 40), 0);

  it("leaves a file that fits as it is, and says nothing was shed", () => {
    const result = fitted(head, [good, fat], sizeOf([good, fat]));
    expect(result).toEqual({ worlds: [good, fat], stripped: 0, dropped: 0 });
  });

  it("empties the lists of the least active world first, and keeps a world that fits as it was", () => {
    const limit = sizeOf([good, { ...fat, realms: fat.realms.map((r) => ({ ...r, functions: [] })) }]);
    const result = fitted(head, [good, fat], limit);
    expect(result?.stripped).toBe(1);
    expect(result?.dropped).toBe(0);
    expect(result?.worlds[0]).toEqual(good);
    expect(result?.worlds[1]?.realms.every((r) => r.functions.length === 0 && r.imports.length === 0)).toBe(true);
    expect(sizeOf(result?.worlds ?? [])).toBeLessThanOrEqual(limit);
  });

  it("drops the least active worlds whole when the lists are not enough", () => {
    const stripped = (w: Row): Row => ({ ...w, realms: w.realms.map((r) => ({ ...r, functions: [] })) });
    const limit = sizeOf([stripped(good)]);
    const result = fitted(head, [good, fat], limit);
    expect(result?.worlds.map((w) => w.id)).toEqual(["good/app"]);
    expect(result?.dropped).toBe(1);
    expect(sizeOf(result?.worlds ?? [])).toBeLessThanOrEqual(limit);
  });

  it("gives nothing when not even an empty file fits", () => {
    expect(fitted(head, [good], 10)).toBeNull();
  });

  it("measures bytes, not characters", () => {
    const wide: Row = { ...good, realms: good.realms.map((r) => ({ ...r, deployerName: "name" })) };
    const limit = sizeOf([wide]);
    expect(fitted(head, [wide], limit)?.dropped).toBe(0);
    expect(fitted(head, [wide], limit - 1)?.stripped).toBe(1);
  });

  it("keeps at most the schema's count of worlds, however small they are (F3539)", () => {
    const many = Array.from({ length: WORLDS_CAPS.worlds + 1 }, (_, i) => row(`w${String(i).padStart(5, "0")}`, 1, 0));
    const result = fitted(head, many, 100 * 1024 * 1024);
    expect(result?.worlds).toHaveLength(WORLDS_CAPS.worlds);
    expect(result?.dropped).toBe(1);
  });

  describe("sheds by activity (F3542)", () => {
    const stripped = (w: Row): Row => ({ ...w, realms: w.realms.map((r) => ({ ...r, functions: [], imports: [] })) });

    it("spares the busy worlds when cheap one-realm worlds fill the file", () => {
      const real = Array.from({ length: 4 }, (_, i) => calling(row(`real${String(i)}`, 1, 6), 500));
      const spam = Array.from({ length: 300 }, (_, i) => calling(row(`spam${String(i).padStart(3, "0")}`, 1, 1), 0));
      const limit = sizeOf([...real, ...spam.map(stripped)]);
      const result = fitted(head, [...real, ...spam], limit);
      expect(result?.worlds.filter((w) => w.id.startsWith("real"))).toEqual(real);
      expect(result?.dropped).toBe(0);
      expect(result?.stripped).toBeGreaterThan(0);
    });

    it("drops the quiet worlds and keeps the busy ones when even bare lists do not fit", () => {
      const busy = Array.from({ length: 3 }, (_, i) => calling(row(`busy${String(i)}`, 1, 20), 900));
      const quiet = Array.from({ length: 40 }, (_, i) => calling(row(`quiet${String(i).padStart(2, "0")}`, 1, 2), 0));
      const limit = sizeOf(busy.map(stripped));
      const result = fitted(head, [...quiet, ...busy], limit);
      expect(result?.worlds.map((w) => w.id)).toEqual(busy.map((w) => w.id));
      expect(result?.dropped).toBe(40);
    });

    it("counts a null count as none, and takes the heavier world first among equals", () => {
      const nothing = calling(row("a-null", 1, 30), null);
      const none = calling(row("b-zero", 1, 20), 0);
      const some = calling(row("c-some", 1, 40), 1);
      const limit = sizeOf([none, stripped(nothing), some]);
      const result = fitted(head, [none, nothing, some], limit);
      expect(result?.stripped).toBe(1);
      expect(result?.worlds).toEqual([none, stripped(nothing), some]);
    });

    it("among worlds as quiet, sheds the most crowded namespace first: many cheap worlds cannot push out a few (F3542)", () => {
      const crowd = Array.from({ length: 12 }, (_, i) =>
        calling({ ...row("spam", 1, 5), id: `spam/w${String(i)}` }, null),
      );
      const few = [calling(row("real", 1, 5), null), calling(row("solid", 1, 5), 0)];
      const result = fitted(head, [...few, ...crowd], sizeOf(few.map(stripped)));
      expect(result?.worlds.map((w) => w.id)).toEqual(["real/app", "solid/app"]);
      expect(result?.dropped).toBe(12);
    });

    it("keeps the order of the input in what it returns", () => {
      const rows = [calling(row("m", 1, 5), 9), calling(row("a", 1, 5), 0), calling(row("z", 1, 5), 4)];
      const result = fitted(head, rows, sizeOf(rows.map(stripped)) + 1);
      expect(result?.worlds.map((w) => w.id)).toEqual(["m/app", "a/app", "z/app"]);
    });

    it("sheds 20,000 worlds in a time that does not grow with the square of their count", () => {
      const many = Array.from({ length: WORLDS_CAPS.worlds }, (_, i) =>
        calling(row(`n${String(i).padStart(5, "0")}`, 1, 3), i % 13),
      );
      const started = performance.now();
      const result = fitted(head, many, 1024 * 1024);
      expect(performance.now() - started).toBeLessThan(750);
      expect(sizeOf(result?.worlds ?? [])).toBeLessThanOrEqual(1024 * 1024);
    });
  });
});
