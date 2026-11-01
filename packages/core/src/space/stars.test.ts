import { describe, expect, it } from "vitest";
import { moodAt, newMood } from "./mood.ts";
import { MOTES, SHELLS, StarCells, type Shell } from "./stars.ts";
import { wrapTo } from "./torus.ts";

const SHELL: Shell = { ...SHELLS[0], salt: 11, side: 4, size: 260, perCell: 24, steep: 5 } as Shell;
const cellOf = (x: number, y: number, z: number) => ({ x, y, z });
const slotOf = (cell: { x: number; y: number; z: number }) =>
  wrapTo(cell.x, 4) + wrapTo(cell.y, 4) * 4 + wrapTo(cell.z, 4) * 16;

function written(cell: { x: number; y: number; z: number }, shell = SHELL) {
  const stars = new StarCells(shell);
  stars.write(slotOf(cell), cell);
  const first = slotOf(cell) * shell.perCell;
  return {
    positions: stars.positions.slice(first * 3, (first + shell.perCell) * 3),
    tints: stars.tints.slice(first * 4, (first + shell.perCell) * 4),
  };
}

const lights = (tints: Uint8Array) => tints.filter((_, at) => at % 4 === 3);
const lit = (tints: Uint8Array) => lights(tints).filter((light) => light > 0).length;

describe("StarCells", () => {
  it("sizes its buffers from the shell", () => {
    const stars = new StarCells(SHELL);
    expect(stars.positions).toHaveLength(4 ** 3 * 24 * 3);
    expect(stars.tints).toHaveLength(4 ** 3 * 24 * 4);
  });

  it("gives a cell the same picture each time", () => {
    expect(written(cellOf(3, -2, 7))).toEqual(written(cellOf(3, -2, 7)));
  });

  it("gives it back unchanged after another cell took its slot", () => {
    const cell = cellOf(1, 1, 1);
    const stars = new StarCells(SHELL);
    const slot = slotOf(cell);
    stars.write(slot, cell);
    const first = stars.tints.slice();
    stars.write(slot, cellOf(5, 1, 1));
    expect(stars.tints).not.toEqual(first);
    stars.write(slot, cell);
    expect(stars.tints).toEqual(first);
  });

  it("leaves no stale tail: a thin cell over a thick one is the thin cell alone", () => {
    const counts = Array.from({ length: 64 }, (_, at) => ({ at, count: lit(written(cellOf(at * 4, 0, 0)).tints) }));
    counts.sort((a, b) => a.count - b.count);
    const thin = cellOf((counts[0]?.at ?? NaN) * 4, 0, 0);
    const thick = cellOf((counts.at(-1)?.at ?? NaN) * 4, 0, 0);
    expect(lit(written(thick).tints)).toBeGreaterThan(lit(written(thin).tints));
    const stars = new StarCells(SHELL);
    stars.write(0, thick);
    stars.write(0, thin);
    expect(lights(stars.tints.slice(0, SHELL.perCell * 4))).toEqual(lights(written(thin).tints));
  });

  it("writes its slot alone: no point runs over into the next", () => {
    const stars = new StarCells(SHELL);
    const slot = 5;
    stars.write(slot, cellOf(1, 1, 0));
    const first = slot * SHELL.perCell;
    expect(stars.tints.slice(0, first * 4).every((level) => level === 0)).toBe(true);
    expect(stars.tints.slice((first + SHELL.perCell) * 4).every((level) => level === 0)).toBe(true);
    expect(stars.positions.slice(0, first * 3).every((value) => value === 0)).toBe(true);
    expect(stars.positions.slice((first + SHELL.perCell) * 3).every((value) => value === 0)).toBe(true);
  });

  it("gives another cell another picture, and another shell another too", () => {
    expect(written(cellOf(0, 0, 1)).positions).not.toEqual(written(cellOf(0, 0, 0)).positions);
    expect(written(cellOf(0, 0, 0), { ...SHELL, salt: 12 }).positions).not.toEqual(written(cellOf(0, 0, 0)).positions);
  });

  it("keeps every point inside its cell, at the coordinates the shader wraps", () => {
    for (const cell of [cellOf(0, 0, 0), cellOf(-1, 2, -3), cellOf(2 ** 40, -(2 ** 40), 7)]) {
      const { positions } = written(cell);
      for (let at = 0; at < positions.length; at += 3)
        for (const [axis, value] of [cell.x, cell.y, cell.z].entries()) {
          const inside = (positions[at + axis] ?? NaN) - wrapTo(value, 4);
          expect(inside).toBeGreaterThanOrEqual(0);
          expect(inside).toBeLessThan(1);
        }
    }
  });

  it("takes its count from the mood where the cell sits: a thick sky holds more than a thin one", () => {
    const rows = Array.from({ length: 512 }, (_, at) => {
      const cell = cellOf(at * 3, at * 5, -at * 2);
      const mood = newMood();
      moodAt(mood, { x: (cell.x + 0.5) * SHELL.size, y: (cell.y + 0.5) * SHELL.size, z: (cell.z + 0.5) * SHELL.size });
      return { density: mood.density, count: lit(written(cell).tints) };
    }).sort((a, b) => a.density - b.density);
    const mean = (part: typeof rows) => part.reduce((sum, { count }) => sum + count, 0) / part.length;
    expect(mean(rows.slice(-128))).toBeGreaterThan(mean(rows.slice(0, 128)) * 1.3);
    expect(Math.max(...rows.map(({ count }) => count))).toBeLessThanOrEqual(SHELL.perCell);
    expect(Math.min(...rows.map(({ count }) => count))).toBeGreaterThan(0);
  });

  it("makes bright stars rare: the steep law's many faint and few bright", () => {
    const all = Array.from({ length: 64 }, (_, at) => [...lights(written(cellOf(at, 0, 0)).tints)])
      .flat()
      .filter((light) => light > 0);
    const bright = all.filter((light) => light > 200).length;
    const faint = all.filter((light) => light < 60).length;
    expect(faint).toBeGreaterThan(bright * 5);
    expect(bright).toBeGreaterThan(0);
  });

  it("colours a star as a star: red to blue-white, never green", () => {
    const { tints } = written(cellOf(9, 9, 9));
    for (let at = 0; at < tints.length; at += 4) {
      const [red, green, blue] = [tints[at] ?? NaN, tints[at + 1] ?? NaN, tints[at + 2] ?? NaN];
      expect(green).toBeLessThanOrEqual(Math.max(red, blue));
    }
  });

  it("has warm and blue stars in the same sky", () => {
    const tints = Array.from({ length: 64 }, (_, at) => [...written(cellOf(at, 1, 0)).tints]).flat();
    let warm = 0;
    let blue = 0;
    for (let at = 0; at < tints.length; at += 4) {
      if ((tints[at] ?? 0) > (tints[at + 2] ?? 0) + 40) warm += 1;
      if ((tints[at + 2] ?? 0) > (tints[at] ?? 0) + 20) blue += 1;
    }
    expect(warm).toBeGreaterThan(0);
    expect(blue).toBeGreaterThan(0);
  });

  it("follows an eye in the world, one cell's size at a time", () => {
    const stars = new StarCells(SHELL);
    expect(stars.follow({ x: 0, y: 0, z: 0 })).toBe(true);
    expect(stars.follow({ x: SHELL.size * 0.4, y: 0, z: 0 })).toBe(false);
    expect(stars.follow({ x: SHELL.size * 0.6, y: 0, z: 0 })).toBe(true);
  });
});

describe("the shells", () => {
  it("are each a sky of their own, and the motes' another", () => {
    const salts = [...SHELLS, MOTES].map(({ salt }) => salt);
    expect(new Set(salts).size).toBe(salts.length);
  });

  it("fade out before a wrapped point could show: a torus's reach is half its side, less the half cell the centre rounds by", () => {
    for (const shell of [...SHELLS, MOTES]) {
      expect(shell.far).toBeLessThanOrEqual(shell.side / 2 - 0.5);
      expect(shell.near).toBeLessThan(shell.far);
    }
  });

  it("nest: each reaches past where the next begins, so depth has no gap", () => {
    const shells = [...SHELLS].sort((a, b) => a.size - b.size);
    for (let at = 0; at + 1 < shells.length; at += 1) {
      const [small, large] = [shells[at], shells[at + 1]];
      if (small === undefined || large === undefined) throw new Error("no shell");
      expect(small.far * small.size).toBeGreaterThan(large.near * large.size);
    }
  });
});
