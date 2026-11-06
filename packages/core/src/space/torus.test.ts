import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { nearestCell, Torus, wrapTo } from "./torus.ts";

interface Written {
  slot: number;
  x: number;
  y: number;
  z: number;
}

// What each slot was last told to hold.
function kept(side: number) {
  const held = new Map<number, Written>();
  const log: Written[] = [];
  // The cell is one object, reused: a copy is what was told.
  const write = vi.fn((slot: number, cell: { x: number; y: number; z: number }) => {
    const told = { slot, x: cell.x, y: cell.y, z: cell.z };
    held.set(slot, told);
    log.push(told);
  });
  return { held, log, write, torus: new Torus(side, write) };
}

const box = (side: number, centre: number) =>
  Array.from({ length: side }, (_, at) => centre - Math.floor(side / 2) + at);

describe("wrapTo", () => {
  it.each([
    [0, 6, 0],
    [5.5, 6, 5.5],
    [6, 6, 0],
    [-0.5, 6, 5.5],
    [-6, 6, 0],
    [2 ** 40 + 0.25, 1, 0.25],
    [-(2 ** 40) - 0.25, 1, 0.75],
    [-1e-17, 6, 0],
  ])("%d into a period of %d is %d", (value, period, expected) => {
    expect(wrapTo(value, period)).toBe(expected);
  });

  it("stays in [0, period) at any coordinate", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -(2 ** 52), max: 2 ** 52, noNaN: true }),
        fc.integer({ min: 1, max: 4096 }),
        (value, period) => {
          const wrapped = wrapTo(value, period);
          expect(wrapped).toBeGreaterThanOrEqual(0);
          expect(wrapped).toBeLessThan(period);
        },
      ),
    );
  });

  it("keeps a step of a thousandth at 2^40, where a 32-bit float would lose it", () => {
    const far = 2 ** 40;
    expect(wrapTo(far + 0.001, 64) - wrapTo(far, 64)).toBeCloseTo(0.001, 3);
  });
});

describe("nearestCell", () => {
  it.each([
    [0, 10, 0],
    [4.9, 10, 0],
    [5, 10, 1],
    [14.9, 10, 1],
    [-4.9, 10, 0],
    [-5, 10, 0],
    [-5.1, 10, -1],
    [2 ** 40, 1, 2 ** 40],
  ])("%d in cells of %d is cell %d", (value, size, expected) => {
    expect(nearestCell(value, size)).toBe(expected);
  });
});

describe("Torus", () => {
  it("writes every slot on its first follow, each cell in the box once", () => {
    const { held, write, torus } = kept(4);
    expect(torus.follow({ x: 0, y: 0, z: 0 })).toBe(true);
    expect(write).toHaveBeenCalledTimes(4 ** 3);
    expect(held.size).toBe(4 ** 3);
    const cells = [...held.values()].map(({ x, y, z }) => `${String(x)},${String(y)},${String(z)}`);
    expect(new Set(cells).size).toBe(4 ** 3);
    for (const { x, y, z } of held.values()) {
      expect(box(4, 0)).toContain(x);
      expect(box(4, 0)).toContain(y);
      expect(box(4, 0)).toContain(z);
    }
  });

  it("writes nothing while the centre stays", () => {
    const { write, torus } = kept(4);
    torus.follow({ x: 3, y: -2, z: 9 });
    write.mockClear();
    expect(torus.follow({ x: 3, y: -2, z: 9 })).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it.each([
    ["x", { x: 1, y: 0, z: 0 }],
    ["y", { x: 0, y: 1, z: 0 }],
    ["z", { x: 0, y: 0, z: 1 }],
    ["back along x", { x: -1, y: 0, z: 0 }],
  ])("writes one face alone on a step along %s: what stays is never written again", (_, to) => {
    const { write, torus } = kept(4);
    torus.follow({ x: 0, y: 0, z: 0 });
    write.mockClear();
    expect(torus.follow(to)).toBe(true);
    expect(write).toHaveBeenCalledTimes(4 ** 2);
  });

  it("puts each entering cell where the shader's wrap will read it", () => {
    const { log, torus } = kept(4);
    torus.follow({ x: 0, y: 0, z: 0 });
    log.length = 0;
    torus.follow({ x: 1, y: 0, z: 0 });
    expect(log.length).toBeGreaterThan(0);
    for (const { slot, x, y, z } of log) {
      expect(slot % 4).toBe(wrapTo(x, 4));
      expect(Math.floor(slot / 4) % 4).toBe(wrapTo(y, 4));
      expect(Math.floor(slot / 16)).toBe(wrapTo(z, 4));
    }
  });

  it("writes two faces on a step of two", () => {
    const { write, torus } = kept(4);
    torus.follow({ x: 0, y: 0, z: 0 });
    write.mockClear();
    torus.follow({ x: 2, y: 0, z: 0 });
    expect(write).toHaveBeenCalledTimes(2 * 4 ** 2);
  });

  it.each([
    ["past the box's side", 5],
    ["of 2^40 cells, in one pass over the slots and no walk there", 2 ** 40],
  ])("writes each slot once on a jump %s", (_, away) => {
    const { log, write, torus } = kept(4);
    torus.follow({ x: 0, y: 0, z: 0 });
    write.mockClear();
    log.length = 0;
    torus.follow({ x: away, y: away, z: 0 });
    expect(write).toHaveBeenCalledTimes(4 ** 3);
    expect(new Set(log.map(({ slot }) => slot)).size).toBe(4 ** 3);
  });

  it("rewrites all of it on a jump, and holds the right box after any walk", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            x: fc.integer({ min: -9, max: 9 }),
            y: fc.integer({ min: -9, max: 9 }),
            z: fc.integer({ min: -9, max: 9 }),
          }),
          { minLength: 1, maxLength: 12 },
        ),
        (walk) => {
          const { held, torus } = kept(4);
          for (const centre of walk) torus.follow(centre);
          const last = walk.at(-1);
          if (last === undefined) throw new Error("no walk");
          expect(held.size).toBe(4 ** 3);
          for (const { x, y, z } of held.values()) {
            expect(box(4, last.x)).toContain(x);
            expect(box(4, last.y)).toContain(y);
            expect(box(4, last.z)).toContain(z);
          }
        },
      ),
    );
  });

  it("holds its box at a far coordinate, past 32 bits", () => {
    const { held, torus } = kept(2);
    const far = 2 ** 40 + 1;
    torus.follow({ x: far, y: -far, z: 0 });
    for (const { x, y } of held.values()) {
      expect(box(2, far)).toContain(x);
      expect(box(2, -far)).toContain(y);
    }
  });
});
