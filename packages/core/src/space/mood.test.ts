import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  heightField,
  MAX_HEIGHT,
  MOOD_SCALE,
  moodAt,
  moodCells,
  newMood,
  MOOD_SIDE,
  MOOD_STEP,
  type Mood,
} from "./mood.ts";

const read = (x: number, y: number, z: number): Mood => {
  const mood = newMood();
  moodAt(mood, { x, y, z });
  return mood;
};
const CHANNELS = ["red", "green", "blue", "haze", "density"] as const;
const far = 2 ** 40;
const coordinate = fc.double({ min: -far, max: far, noNaN: true });
const nearby = fc.double({ min: -5000, max: 5000, noNaN: true });

describe("moodAt", () => {
  // Worked out apart from this code, in Python's doubles: the same place is the same mood, on every device and in every release.
  it.each([
    { x: 0, y: 0, z: 0, mood: [0.39276725859695627, 0.11714842487646512, 0.01493726540806163, 1, 0.924805551348254] },
    { x: 170.25, y: -3000.5, z: 8123.125, mood: [0.1946194841509427, 0.017609649397640897, 0.03949922041589681, 0, 1] },
    {
      x: 2900,
      y: 4400,
      z: -1800,
      mood: [0.18724543786955236, 0.018851757393358266, 0.04125090052840455, 0.0832055142119331, 0.8204884196353488],
    },
    {
      x: 2 ** 40 + 0.5,
      y: -(2 ** 33) + 0.25,
      z: 7,
      mood: [0.1329643708119279, 0.03852551363488118, 0.08464110357423997, 0, 0.3085894341678159],
    },
  ])("holds its value at $x, $y, $z", ({ x, y, z, mood }) => {
    const found = read(x, y, z);
    CHANNELS.forEach((channel, at) => {
      expect(found[channel]).toBeCloseTo(mood[at] ?? NaN, 9);
    });
  });

  it("gives the same mood for the same position, from any earlier read", () => {
    fc.assert(
      fc.property(coordinate, coordinate, coordinate, (x, y, z) => {
        const reused = newMood();
        moodAt(reused, { x: x + 1, y, z });
        moodAt(reused, { x, y, z });
        expect(reused).toEqual(read(x, y, z));
      }),
    );
  });

  it("holds every channel between 0 and 1, at any coordinate", () => {
    fc.assert(
      fc.property(coordinate, coordinate, coordinate, (x, y, z) => {
        const mood = read(x, y, z);
        for (const channel of CHANNELS) {
          expect(mood[channel]).toBeGreaterThanOrEqual(0);
          expect(mood[channel]).toBeLessThanOrEqual(1);
        }
      }),
    );
  });

  it("changes a little for a small step, near and far: no border anywhere", () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.oneof(nearby, coordinate), nearby, nearby),
        fc.double({ min: -1, max: 1, noNaN: true }),
        ([x, y, z], step) => {
          const here = read(x, y, z);
          const there = read(x + step, y, z);
          for (const channel of CHANNELS)
            expect(Math.abs(here[channel] - there[channel])).toBeLessThanOrEqual(0.02 * Math.abs(step) + 1e-9);
        },
      ),
    );
  });

  // A random step almost never straddles a border: this walks over many, on each axis, near and past 32 bits.
  it.each([
    ["x", 0, [1, 0, 0]],
    ["y", 0, [0, 1, 0]],
    ["z", 0, [0, 0, 1]],
    ["x, past 32 bits", far, [1, 0, 0]],
    ["y, past 32 bits", -far, [0, 1, 0]],
    ["z, past 32 bits", far, [0, 0, 1]],
  ] as const)("has no border along %s: a dense walk never jumps", (_, from, [dx, dy, dz]) => {
    const steps = 8 * MOOD_SCALE;
    let last = read(from * dx, from * dy, from * dz);
    for (let step = 1; step <= steps; step += 1) {
      const next = read((from + step) * dx, (from + step) * dy, (from + step) * dz);
      for (const channel of CHANNELS) expect(Math.abs(next[channel] - last[channel])).toBeLessThanOrEqual(0.02);
      last = next;
    }
  });

  it("is not the same place twice: it never repeats along an axis", () => {
    for (const away of [2 ** 16, 2 ** 24, 2 ** 32, 2 ** 40])
      expect(read(away * 340, 170, 170)).not.toEqual(read(0, 170, 170));
  });

  it("varies over the distance of a few systems, not of a whole sky: a walk meets several moods", () => {
    const hazes = Array.from({ length: 64 }, (_, step) => read(step * 200, 0, 0).haze);
    expect(Math.max(...hazes) - Math.min(...hazes)).toBeGreaterThan(0.4);
  });

  it("leaves most of space near-black", () => {
    const samples = 4096;
    let empty = 0;
    for (let at = 0; at < samples; at += 1) if (read(at * 977.3, at * 411.7, at * 1503.1).haze < 0.1) empty += 1;
    expect(empty / samples).toBeGreaterThan(0.4);
  });

  // A palette from space photography: warm hydrogen and dust, cool oxygen, and never a sign's pure hue.
  it("reaches warm and cool, and stays a real sky's colours", () => {
    let warm = 0;
    let cool = 0;
    const samples = 2048;
    for (let at = 0; at < samples; at += 1) {
      const { red, green, blue } = read(at * 613.7, at * 289.3, at * 1201.9);
      if (red > blue * 2) warm += 1;
      if (blue > red * 1.5) cool += 1;
      expect(Math.max(red, green, blue)).toBeLessThan(0.7);
      expect(green).toBeLessThanOrEqual(Math.max(red, blue) + 0.01);
    }
    expect(warm / samples).toBeGreaterThan(0.2);
    expect(cool / samples).toBeGreaterThan(0.1);
  });

  it("spreads density too, so a thick and a thin sky both exist", () => {
    const densities = Array.from({ length: 512 }, (_, at) => read(at * 733.1, at * 97.9, at * 431.3).density);
    expect(Math.min(...densities)).toBeLessThan(0.3);
    expect(Math.max(...densities)).toBeGreaterThan(0.7);
  });
});

describe("moodCells", () => {
  const voxel = (data: Uint8Array, slot: number) => [...data.slice(slot * 4, slot * 4 + 4)];
  const expected = (cell: { x: number; y: number; z: number }) => {
    const mood = read(cell.x * MOOD_STEP, cell.y * MOOD_STEP, cell.z * MOOD_STEP);
    return [mood.red, mood.green, mood.blue, mood.haze].map((level) => Math.round(level * 255));
  };

  it("holds the mood of its lattice, each point in the slot the volume's wrap reads", () => {
    const cells = moodCells();
    cells.follow({ x: 0, y: 0, z: 0 });
    for (const cell of [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 2, z: 3 },
      { x: -1, y: -2, z: 4 },
    ]) {
      const wrap = (value: number) => (value + MOOD_SIDE) % MOOD_SIDE;
      const slot = wrap(cell.x) + wrap(cell.y) * MOOD_SIDE + wrap(cell.z) * MOOD_SIDE ** 2;
      expect(voxel(cells.data, slot)).toEqual(expected(cell));
    }
  });

  it("follows the eye through the world, not the lattice", () => {
    const cells = moodCells();
    expect(cells.follow({ x: 0, y: 0, z: 0 })).toBe(true);
    expect(cells.follow({ x: MOOD_STEP * 0.4, y: 0, z: 0 })).toBe(false);
    expect(cells.follow({ x: MOOD_STEP * 0.6, y: 0, z: 0 })).toBe(true);
  });

  it("gives a place the same volume, by whatever road", () => {
    const one = moodCells();
    const two = moodCells();
    one.follow({ x: MOOD_STEP * 40, y: 0, z: 0 });
    two.follow({ x: 0, y: 0, z: 0 });
    two.follow({ x: MOOD_STEP * 3, y: MOOD_STEP * 90, z: 0 });
    two.follow({ x: MOOD_STEP * 40, y: 0, z: 0 });
    expect(two.data).toEqual(one.data);
  });
});

describe("heightField, a smooth field of position", () => {
  const CELL = 10;
  const points = fc.tuple(
    fc.double({ min: -1e5, max: 1e5, noNaN: true }),
    fc.double({ min: -1e5, max: 1e5, noNaN: true }),
  );

  it("is a pure function, bounded by MAX_HEIGHT, at any coordinate", () => {
    fc.assert(
      fc.property(points, ([x, z]) => {
        expect(heightField(x, z)).toBe(heightField(x, z));
        expect(Math.abs(heightField(x, z))).toBeLessThanOrEqual(MAX_HEIGHT);
      }),
    );
    expect(Number.isFinite(heightField(1e9, -1e9))).toBe(true);
  });

  it("changes by at most half the distance moved, for a step of up to a cell: a small step, a small change", () => {
    fc.assert(
      fc.property(
        points,
        fc.double({ min: 0, max: Math.PI * 2, noNaN: true }),
        fc.double({ min: 0, max: CELL, noNaN: true }),
        ([x, z], angle, d) => {
          const moved = heightField(x + d * Math.cos(angle), z + d * Math.sin(angle));
          expect(Math.abs(moved - heightField(x, z))).toBeLessThanOrEqual(0.5 * d + 1e-9);
        },
      ),
    );
  });

  it("is no constant and no list: it rises and falls across the plane, with no jump, above and below zero", () => {
    const samples = Array.from({ length: 4_000 }, (_, i) =>
      heightField((i % 80) * CELL * 1.5, Math.floor(i / 80) * CELL * 1.5),
    );
    expect(Math.max(...samples)).toBeGreaterThan(2);
    expect(Math.min(...samples)).toBeLessThan(-2);
    expect(new Set(samples.map((h) => h.toFixed(3))).size).toBeGreaterThan(1_000);
  });

  it("stays near the plane most of the way, for the noise is cubed", () => {
    const samples = Array.from({ length: 10_000 }, (_, i) =>
      Math.abs(heightField((i % 100) * CELL * 4, Math.floor(i / 100) * CELL * 4)),
    );
    expect(samples.filter((h) => h < 2).length / samples.length).toBeGreaterThan(0.6);
  });

  // Worked out apart from this code, in Python's doubles: the same place stands at the same height on every device.
  it.each([
    [0, 0, -0.44782901],
    [10, 10, -0.447142927],
    [123.5, -456.25, 1.531437438],
    [-1500, 2200, 1.023914607],
    [-37.5, -37.5, -0.332781449],
    [800, 800, -7.274498829],
    [1e5, -1e5, -3.687192924],
    [1e9, -1e9, -6.784045412],
  ])("gives the field at (%j, %j) as %j", (x, z, expected) => {
    expect(Math.abs(heightField(x, z) - expected)).toBeLessThan(1e-6);
  });
});
