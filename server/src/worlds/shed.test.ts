import { Worlds } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { fitted } from "./shed.ts";

// A file that breaks a cap is shed to fit, never refused whole: lists first, from the heaviest world, then whole worlds.
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
const head = { version: 1, universe: "onyx", updated: "2026-11-01T12:00:00.000Z" } as const;
const sizeOf = (worlds: Row[]): number => Buffer.byteLength(`${JSON.stringify({ ...head, worlds })}\n`);

describe("fitted", () => {
  const good = row("good", 2, 3);
  const fat = row("fat", 5, 40);

  it("leaves a file that fits as it is, and says nothing was shed", () => {
    const result = fitted(head, [good, fat], sizeOf([good, fat]));
    expect(result).toEqual({ worlds: [good, fat], stripped: 0, dropped: 0 });
  });

  it("empties the lists of the heaviest world first, and keeps a world that fits as it was", () => {
    const limit = sizeOf([good, { ...fat, realms: fat.realms.map((r) => ({ ...r, functions: [] })) }]);
    const result = fitted(head, [good, fat], limit);
    expect(result?.stripped).toBe(1);
    expect(result?.dropped).toBe(0);
    expect(result?.worlds[0]).toEqual(good);
    expect(result?.worlds[1]?.realms.every((r) => r.functions.length === 0 && r.imports.length === 0)).toBe(true);
    expect(sizeOf(result?.worlds ?? [])).toBeLessThanOrEqual(limit);
  });

  it("drops the heaviest worlds whole when the lists are not enough", () => {
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
});
