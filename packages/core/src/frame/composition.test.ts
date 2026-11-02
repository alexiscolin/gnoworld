import { describe, expect, it } from "vitest";
import { composed, coveredShare, offLine } from "./composition.ts";
import type { Seen } from "./restLook.ts";

// Spots placed by hand just inside and just outside each rule (7d6's review, F4251): the view's sets never come near its limits.
const spot = (x: number, y: number, [radius, away] = [4, 40]): Seen => ({ x, y, radius, depth: away, away });
// The Earth far from every spot, unless a test puts it among them.
const EARTH = spot(-5000, -5000);
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
    expect(composed(four, spot(190, 110), false)).toBe(true);
    expect(composed([...four, spot(95, 55)], spot(190, 110), false)).toBe(false);
  });
});

describe("the air between bodies, and depth's cover", () => {
  // Two bodies 10 pixels across at a like distance: a third of the smaller one's width is 6.67 pixels.
  it("keeps a third of the smaller one's width between two bodies at a like distance, within 1.5 times", () => {
    const left = spot(0, 0, [10, 40]);
    expect(composed([left, spot(27, 0, [10, 59])], EARTH, false)).toBe(true);
    expect(composed([left, spot(26, 0, [10, 59])], EARTH, false)).toBe(false);
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
    expect(composed([near, spot(apartFor(0.49), 0, [10, 30])], EARTH, false)).toBe(true);
    expect(composed([near, spot(apartFor(0.51), 0, [10, 30])], EARTH, false)).toBe(false);
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

  // The Earth at the rectangle's middle adds nothing across or along.
  it("refuses four bodies a fifth across or less, and keeps them past it", () => {
    expect(composed(corners(600, 114), spot(300, 57), false)).toBe(false);
    expect(composed(corners(600, 126), spot(300, 63), false)).toBe(true);
  });

  // With a close world: corners of `height` by 600, their sizes `sizes` times apart and distances `distances` times, the Earth between.
  const deep = (height: number, sizes: number, distances: number) =>
    composed(
      [
        spot(0, 0, [40, 10]),
        spot(600, 0, [40 / sizes, 10 * distances]),
        spot(0, height, [20, 15]),
        spot(600, height, [20, 20]),
      ],
      spot(300, height / 2, [20, 12]),
      true,
    );

  it("keeps a view with a close world a tenth across a line, its sizes four times apart and distances 2.5 times", () => {
    expect(deep(66, 4, 2.5)).toBe(true);
    expect(deep(54, 4, 2.5)).toBe(false);
    expect(deep(66, 3.9, 2.5)).toBe(false);
    expect(deep(66, 4, 2.4)).toBe(false);
  });
});
