import { describe, expect, it } from "vitest";
import { composed, coveredShare, offLine, type Frame } from "./composition.ts";
import type { Seen } from "./restLook.ts";

// Spots placed by hand just inside and just outside each rule (7d6's review, F4251): the view's sets never come near its limits.
const spot = (x: number, y: number, [radius, away] = [4, 40]): Seen => ({
  x,
  y,
  radius,
  depth: away,
  away,
  ...{ left: x - radius, right: x + radius, top: y - radius, bottom: y + radius },
});
// The Earth far from every spot and off the screen, unless a test puts it among them.
const EARTH = spot(-5000, -5000);
// A screen wide enough for every spot placed, with no glowing star: with a close world, or not.
const SCREEN = { width: 10_000, height: 10_000, lights: [] };
const FLAT: Frame = { ...SCREEN, deep: false };
const DEEP: Frame = { ...SCREEN, deep: true };
// Four corners of a W by H rectangle, far from the Earth: they read `H / W` off a line.
const corners = (width: number, height: number, away = 40) => [
  spot(0, 0, [4, away]),
  spot(width, 0, [4, away]),
  spot(0, height, [4, away]),
  spot(width, height, [4, away]),
];

describe("the densest group", () => {
  it("keeps four bodies in a box of 200 by 120 pixels, the Earth among them, and refuses a fifth", () => {
    const four = [spot(0, 0), spot(190, 0), spot(0, 110)];
    expect(composed(four, spot(190, 110), FLAT)).toBe(true);
    expect(composed([...four, spot(95, 55)], spot(190, 110), FLAT)).toBe(false);
  });

  // Seen on 7d6's review: a box centred on each body misses a group at the corners of one box.
  it("refuses five bodies in any such box, though no box centred on one of them holds all five", () => {
    const five = [spot(0, 0), spot(199, 0), spot(0, 119), spot(199, 119), spot(100, 0)];
    expect(composed(five, spot(100, 300), FLAT)).toBe(false);
  });
});

describe("the air between bodies, and depth's cover", () => {
  // Two bodies 10 pixels across at a like distance: a third of the smaller one's width is 6.67 pixels.
  it("keeps a third of the smaller one's width between two bodies at a like distance, within 1.5 times", () => {
    const left = spot(0, 0, [10, 40]);
    expect(composed([left, spot(27, 0, [10, 59])], EARTH, FLAT)).toBe(true);
    expect(composed([left, spot(26, 0, [10, 59])], EARTH, FLAT)).toBe(false);
  });

  // Equal radii `r`, centres `d` apart: the lens is 2r²·acos(d/2r) − (d/2)·√(4r² − d²).
  const share = (apart: number, radius: number) =>
    (2 * radius ** 2 * Math.acos(apart / (2 * radius)) - (apart / 2) * Math.sqrt(4 * radius ** 2 - apart ** 2)) /
    (Math.PI * radius ** 2);
  const apartFor = (wanted: number) => {
    let [low, high] = [0, 20];
    for (let step = 0; step < 60; step += 1) {
      const middle = (low + high) / 2;
      if (share(middle, 10) > wanted) low = middle;
      else high = middle;
    }
    return (low + high) / 2;
  };

  it("lets a body 1.5 times nearer cover a farther one by half at most", () => {
    const near = spot(0, 0, [10, 20]);
    expect(composed([near, spot(apartFor(0.49), 0, [10, 30])], EARTH, FLAT)).toBe(true);
    expect(composed([near, spot(apartFor(0.51), 0, [10, 30])], EARTH, FLAT)).toBe(false);
  });

  it("measures the share covered: none apart, a small one's whole disc, a large one's all, a lens between", () => {
    expect(coveredShare(spot(0, 0, [5, 40]), spot(20, 0, [5, 40]))).toBe(0);
    expect(coveredShare(spot(0, 0, [2, 40]), spot(1, 0, [8, 40]))).toBeCloseTo(4 / 64, 12);
    expect(coveredShare(spot(0, 0, [8, 40]), spot(1, 0, [2, 40]))).toBe(1);
    expect(coveredShare(spot(0, 0, [10, 40]), spot(5, 0, [10, 40]))).toBeCloseTo(0.685, 3);
    expect(coveredShare(spot(0, 0, [10, 40]), spot(7, 0, [10, 40]))).toBeCloseTo(share(7, 10), 12);
  });
});

describe("no line, and depth with a close world", () => {
  it("measures how far spots stand off a line: across over along", () => {
    expect(offLine(corners(600, 120))).toBeCloseTo(0.2, 12);
    expect(offLine([spot(0, 0), spot(10, 10), spot(20, 20), spot(30, 30)])).toBe(0);
  });

  // The Earth off the screen: at the rectangle's middle it added nothing across or along, but stood on its diagonals at like gaps.
  it("refuses four bodies a fifth across or less, and keeps them past it", () => {
    expect(composed(corners(600, 114), EARTH, FLAT)).toBe(false);
    expect(composed(corners(600, 126), EARTH, FLAT)).toBe(true);
  });

  // With a close world: corners of `height` by 600, their sizes `sizes` times apart and distances `distances` times, the Earth off the
  // screen (between them it stood on their diagonals at like gaps).
  const deep = (height: number, sizes: number, distances: number) =>
    composed(
      [
        spot(0, 0, [40, 10]),
        spot(600, 0, [40 / sizes, 10 * distances]),
        spot(0, height, [20, 15]),
        spot(600, height, [20, 20]),
      ],
      spot(-5000, -5000, [20, 12]),
      DEEP,
    );

  it("keeps a view with a close world a tenth across a line, its sizes four times apart and distances 2.5 times", () => {
    expect(deep(66, 4, 2.5)).toBe(true);
    expect(deep(54, 4, 2.5)).toBe(false);
    expect(deep(66, 3.9, 2.5)).toBe(false);
    expect(deep(66, 4, 2.4)).toBe(false);
  });
});

// The chief, 2026-11-02: a line is not wrong in itself (Alexis's references put worlds on a slanted line that recedes, and that is depth); a
// row of three or more is refused when it does not recede, its sizes falling less than twice from near to far. It is judged on what stands
// on the screen: centres on it, and the glowing stars.
describe("a row of bodies", () => {
  const row = (radii: readonly number[], aways: readonly number[]) =>
    radii.map((radius, at) => spot(300 + 300 * at, 500 + 30 * at, [radius, aways[at] ?? NaN]));

  it("refuses three bodies of a size in a row", () => {
    expect(composed(row([20, 20, 20], [20, 30, 40]), EARTH, FLAT)).toBe(false);
  });

  it("keeps a row that recedes: its distances rising one way, its sizes falling twice or more from the nearest to the farthest", () => {
    expect(composed(row([40, 24, 20], [10, 20, 30]), EARTH, FLAT)).toBe(true);
    expect(composed(row([40, 24, 21], [10, 20, 30]), EARTH, FLAT)).toBe(false);
    expect(composed(row([40, 10, 20], [10, 40, 30]), EARTH, FLAT)).toBe(false);
  });

  it("judges the row on the centres on the screen: a body whose centre stands off it does not break the row", () => {
    const off = spot(-30, 2000, [300, 5]);
    expect(composed([...row([20, 20, 20], [20, 30, 40]), off], EARTH, { ...FLAT, width: 1728, height: 1080 })).toBe(
      false,
    );
  });

  // Its gaps unequal, 300 and 600 pixels: at like gaps the row is refused whatever stands off it.
  it("counts the glowing stars in the row: one off the line breaks it", () => {
    const uneven = [spot(300, 500, [20, 20]), spot(600, 530, [20, 30]), spot(1200, 590, [20, 40])];
    const lights = [{ x: 600, y: 900, radius: 0 }];
    expect(composed(uneven, EARTH, FLAT)).toBe(false);
    expect(composed(uneven, EARTH, { ...FLAT, lights })).toBe(true);
  });
});
