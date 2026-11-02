import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BOXES_MOST, DEPTH, DISCS_MOST, LABEL_SLOTS, LabelLayout, PLACE, settle } from "./settle.ts";

// Where the labels stand on a frame (ADR-0002 §1: labels never overlap; slice 7 §3: off the plate, the rail and each other): beside their
// bodies as frame 4's sit, the first slots first, clear of each other, of the boxes the page keeps and of the bodies' discs; a label that
// finds no room hides. A far world's label is smaller and fainter. Nothing is made on a frame: the layout is the caller's, written in place.
const SCREEN = { width: 1728, height: 1080 };

interface Ask {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly away?: number;
  readonly width?: number;
  readonly height?: number;
}

function layoutOf(asks: readonly Ask[], keep: { boxes?: number[][]; discs?: number[][] } = {}): LabelLayout {
  const layout = new LabelLayout();
  layout.screenWidth = SCREEN.width;
  layout.screenHeight = SCREEN.height;
  asks.forEach(({ x, y, radius, away = DEPTH.near, width = 150, height = 32 }, slot) => {
    layout.active[slot] = 1;
    layout.x[slot] = x;
    layout.y[slot] = y;
    layout.radius[slot] = radius;
    layout.away[slot] = away;
    layout.width[slot] = width;
    layout.height[slot] = height;
  });
  for (const box of keep.boxes ?? []) layout.boxes.set(box, 4 * layout.boxCount++);
  for (const disc of keep.discs ?? []) layout.discs.set(disc, 3 * layout.discCount++);
  return layout;
}

interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const at = (values: Float64Array | Uint8Array | Int8Array, slot: number) => values[slot] ?? NaN;
const rectOf = (layout: LabelLayout, slot: number): Rect => {
  const scale = at(layout.scale, slot);
  const left = at(layout.left, slot);
  const top = at(layout.top, slot);
  return { left, top, right: left + at(layout.width, slot) * scale, bottom: top + at(layout.height, slot) * scale };
};
const stemOf = (layout: LabelLayout, slot: number) =>
  at(layout.left, slot) + at(layout.stem, slot) * at(layout.scale, slot);
const shownSlots = (layout: LabelLayout) => [...Array(LABEL_SLOTS).keys()].filter((slot) => layout.shown[slot] === 1);
const apart = (a: Rect, b: Rect, air: number) =>
  a.right + air <= b.left || b.right + air <= a.left || a.bottom + air <= b.top || b.bottom + air <= a.top;
const offDisc = ({ left, top, right, bottom }: Rect, [x = 0, y = 0, radius = 0]: readonly number[], air: number) =>
  Math.hypot(Math.max(left - x, 0, x - right), Math.max(top - y, 0, y - bottom)) >= radius + air;
const offBox = (rect: Rect, [left = 0, top = 0, right = 0, bottom = 0]: readonly number[], air: number) =>
  apart(rect, { left, top, right, bottom }, air);
// The gap between a label and its body's outline under (or over) its stem.
const gapOf = (layout: LabelLayout, slot: number) => {
  const [x, y, radius] = [at(layout.x, slot), at(layout.y, slot), at(layout.radius, slot)];
  const outline = Math.sqrt(Math.max(radius ** 2 - (stemOf(layout, slot) - x) ** 2, 0));
  const rect = rectOf(layout, slot);
  return at(layout.side, slot) >= 2 ? rect.top - (y + outline) : y - outline - rect.bottom;
};

describe("frame 4's measures", () => {
  it("puts the stem about 12 px in from the label's edge and the label 20 to 29 px off its body, as f0004's Earth and Memba DAO", () => {
    expect(PLACE.stem).toBeGreaterThanOrEqual(10);
    expect(PLACE.stem).toBeLessThanOrEqual(14);
    expect(PLACE.gap).toBeGreaterThanOrEqual(20);
    expect(PLACE.gap).toBeLessThanOrEqual(29);
  });
});

describe("a label beside its body", () => {
  it("stands as frame 4's: its stem over the body's middle, a gap above its top", () => {
    const layout = layoutOf([{ x: 864, y: 540, radius: 54 }]);
    settle(layout);
    expect(layout.shown[0]).toBe(1);
    expect(layout.side[0]).toBe(0);
    const rect = rectOf(layout, 0);
    expect(rect.left).toBeCloseTo(864 - PLACE.stem, 9);
    expect(rect.bottom).toBeCloseTo(540 - 54 - PLACE.gap, 9);
    expect(layout.stem[0]).toBeCloseTo(PLACE.stem, 9);
  });

  it("stands left of its stem on the second side, under its body on the third, as their geometry says", () => {
    const above = [0, 0, SCREEN.width, 470];
    const second = layoutOf([{ x: 864, y: 540, radius: 54 }], { boxes: [[890, 0, SCREEN.width, 470]] });
    settle(second);
    expect(second.side[0]).toBe(1);
    expect(rectOf(second, 0).right).toBeCloseTo(864 + PLACE.stem, 9);
    expect(gapOf(second, 0)).toBeCloseTo(PLACE.gap, 9);
    const third = layoutOf([{ x: 864, y: 540, radius: 54 }], { boxes: [above] });
    settle(third);
    expect(third.side[0]).toBe(2);
    expect(rectOf(third, 0).left).toBeCloseTo(864 - PLACE.stem, 9);
    expect(rectOf(third, 0).top).toBeCloseTo(540 + 54 + PLACE.gap, 9);
  });

  it("stays inside the screen by its edge, its stem still over the body", () => {
    const layout = layoutOf([{ x: 1600, y: 140, radius: 40 }]);
    settle(layout);
    expect(layout.shown[0]).toBe(1);
    const rect = rectOf(layout, 0);
    expect(rect.right).toBeLessThanOrEqual(SCREEN.width - PLACE.margin);
    expect(rect.top).toBeGreaterThanOrEqual(PLACE.margin);
    expect(Math.abs(stemOf(layout, 0) - 1600)).toBeLessThan(40);
  });

  it("slides into the screen over a body cut by its edge, its stem landing on the body's outline", () => {
    const layout = layoutOf([{ x: -50, y: 540, radius: 157, away: 9.8 }]);
    settle(layout);
    expect(layout.shown[0]).toBe(1);
    expect(rectOf(layout, 0).left).toBeCloseTo(PLACE.margin, 9);
    expect(gapOf(layout, 0)).toBeCloseTo(PLACE.gap, 6);
  });

  it("hides the label of a body cut so far that no stem can reach it", () => {
    const layout = layoutOf([{ x: -300, y: 540, radius: 157 }]);
    settle(layout);
    expect(layout.shown[0]).toBe(0);
  });

  it("keeps the side it stood on while it still fits, so a label does not flicker as its body turns", () => {
    const layout = layoutOf([{ x: 864, y: 540, radius: 54 }]);
    layout.side[0] = 3;
    settle(layout);
    expect(layout.side[0]).toBe(3);
    expect(rectOf(layout, 0).top).toBeCloseTo(540 + 54 + PLACE.gap, 9);
  });

  it("leaves a side it kept once the page takes it", () => {
    const layout = layoutOf([{ x: 864, y: 540, radius: 54 }], { boxes: [[0, 0, SCREEN.width, 470]] });
    layout.side[0] = 0;
    settle(layout);
    expect(layout.shown[0]).toBe(1);
    expect(layout.side[0]).toBeGreaterThanOrEqual(2);
  });

  it("stands the same twice: a frame that moves nothing moves no label", () => {
    const layout = layoutOf([
      { x: 800, y: 500, radius: 30 },
      { x: 830, y: 505, radius: 30 },
      { x: 300, y: 300, radius: 10, away: 60 },
    ]);
    settle(layout);
    const first = [Array.from(layout.left), Array.from(layout.top), Array.from(layout.side)];
    settle(layout);
    expect([Array.from(layout.left), Array.from(layout.top), Array.from(layout.side)]).toEqual(first);
  });

  it("shows nothing in a slot that holds no label", () => {
    const layout = layoutOf([{ x: 864, y: 540, radius: 54 }]);
    layout.shown.fill(1);
    settle(layout);
    expect(shownSlots(layout)).toEqual([0]);
  });

  it("hides a label it cannot place, its scale and fade still numbers: a body behind the eye, a size not yet measured", () => {
    const layout = layoutOf([
      { x: Number.NaN, y: 540, radius: 10 },
      { x: 400, y: Number.POSITIVE_INFINITY, radius: 10 },
      { x: 600, y: 540, radius: 10, away: Number.NaN },
      { x: 800, y: 540, radius: 10, away: 0 },
      { x: 1000, y: 540, radius: 10, width: 0 },
    ]);
    settle(layout);
    expect(shownSlots(layout)).toEqual([3]);
    for (let slot = 0; slot < 5; slot += 1) {
      expect(Number.isFinite(at(layout.scale, slot))).toBe(true);
      expect(Number.isFinite(at(layout.fade, slot))).toBe(true);
    }
  });
});

describe("no overlap", () => {
  it("moves the second of two near bodies to another side before it would cover the first's label", () => {
    const layout = layoutOf([
      { x: 800, y: 500, radius: 30 },
      { x: 830, y: 505, radius: 30 },
    ]);
    settle(layout);
    expect(shownSlots(layout)).toEqual([0, 1]);
    expect(layout.side[0]).toBe(0);
    expect(layout.side[1]).not.toBe(0);
    expect(apart(rectOf(layout, 0), rectOf(layout, 1), PLACE.air)).toBe(true);
  });

  it("never covers the Earth, the hero or the bands the page keeps, and a label with no room hides", () => {
    const hero = [48, 620, 780, 1040];
    const earth = [864, 540, 60];
    const layout = layoutOf([{ x: 700, y: 640, radius: 20 }], { boxes: [hero], discs: [earth] });
    settle(layout);
    expect(layout.shown[0]).toBe(1);
    expect(offBox(rectOf(layout, 0), hero, PLACE.air)).toBe(true);
    expect(offDisc(rectOf(layout, 0), earth, PLACE.air)).toBe(true);
    const boxed = layoutOf([{ x: 400, y: 800, radius: 20 }], { boxes: [[0, 0, SCREEN.width, SCREEN.height]] });
    settle(boxed);
    expect(boxed.shown[0]).toBe(0);
  });

  it("skips a slot's own body among the discs, so the Earth's label stands by the Earth", () => {
    const layout = layoutOf([{ x: 864, y: 540, radius: 54 }], { discs: [[864, 540, 54]] });
    layout.own[0] = 0;
    settle(layout);
    expect(layout.shown[0]).toBe(1);
    expect(layout.side[0]).toBe(0);
  });

  it(`keeps clear of all ${String(BOXES_MOST)} boxes and ${String(DISCS_MOST)} discs it holds, and of none past them`, () => {
    const boxes = Array.from({ length: BOXES_MOST + 2 }, (_, index) => [index * 100, 0, index * 100 + 50, 300]);
    const discs = Array.from({ length: DISCS_MOST }, (_, index) => [100 + index * 90, 900, 30]);
    const layout = new LabelLayout();
    for (const [index, box] of boxes.entries()) if (index < BOXES_MOST) layout.boxes.set(box, 4 * index);
    layout.boxCount = BOXES_MOST + 2;
    for (const [index, disc] of discs.entries()) layout.discs.set(disc, 3 * index);
    layout.discCount = DISCS_MOST;
    expect(() => {
      settle(layout);
    }).not.toThrow();
    const full = layoutOf([{ x: 1530, y: 860, radius: 10 }], { discs: [[1470, 820, 40]] });
    settle(full);
    expect(full.shown[0]).toBe(1);
    expect(offDisc(rectOf(full, 0), [1470, 820, 40], PLACE.air)).toBe(true);
  });

  it("holds whatever stands where: shown labels clear of each other, the boxes, the discs and the screen's edge, each beside its body", () => {
    const ask = fc.record({
      x: fc.double({ min: -200, max: SCREEN.width + 200, noNaN: true }),
      y: fc.double({ min: -200, max: SCREEN.height + 200, noNaN: true }),
      radius: fc.double({ min: 2, max: 200, noNaN: true }),
      away: fc.double({ min: 1, max: 400, noNaN: true }),
      width: fc.double({ min: 40, max: 320, noNaN: true }),
      height: fc.double({ min: 20, max: 40, noNaN: true }),
    });
    const box = fc
      .tuple(fc.nat(SCREEN.width), fc.nat(SCREEN.height), fc.nat(600), fc.nat(400))
      .map(([left, top, wide, high]) => [left, top, left + wide, top + high]);
    const disc = fc.tuple(fc.nat(SCREEN.width), fc.nat(SCREEN.height), fc.integer({ min: 1, max: 200 }));
    fc.assert(
      fc.property(
        fc.array(ask, { maxLength: LABEL_SLOTS }),
        fc.array(box, { maxLength: 4 }),
        fc.array(disc, { maxLength: 12 }),
        (asks, boxes, discs) => {
          const layout = layoutOf(asks, { boxes, discs });
          settle(layout);
          settle(layout);
          const shown = shownSlots(layout);
          expect(shown.every((slot) => slot < asks.length)).toBe(true);
          for (const slot of shown) {
            const rect = rectOf(layout, slot);
            expect(rect.left).toBeGreaterThanOrEqual(PLACE.margin - 1e-9);
            expect(rect.top).toBeGreaterThanOrEqual(PLACE.margin - 1e-9);
            expect(rect.right).toBeLessThanOrEqual(SCREEN.width - PLACE.margin + 1e-9);
            expect(rect.bottom).toBeLessThanOrEqual(SCREEN.height - PLACE.margin + 1e-9);
            for (const each of boxes) expect(offBox(rect, each, PLACE.air - 1e-9)).toBe(true);
            for (const each of discs) expect(offDisc(rect, each, PLACE.air - 1e-9)).toBe(true);
            for (const other of shown)
              if (other !== slot) expect(apart(rect, rectOf(layout, other), PLACE.air - 1e-9)).toBe(true);
            expect(Math.abs(stemOf(layout, slot) - at(layout.x, slot))).toBeLessThanOrEqual(
              at(layout.radius, slot) + 1e-9,
            );
            expect(gapOf(layout, slot)).toBeCloseTo(PLACE.gap * at(layout.scale, slot), 6);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("shows a lone label wherever its body stands well inside an empty screen", () => {
    fc.assert(
      fc.property(
        fc.record({
          x: fc.double({ min: 300, max: SCREEN.width - 300, noNaN: true }),
          y: fc.double({ min: 300, max: SCREEN.height - 300, noNaN: true }),
          radius: fc.double({ min: 1, max: 150, noNaN: true }),
          away: fc.double({ min: 1, max: 400, noNaN: true }),
        }),
        (lone) => {
          const layout = layoutOf([lone]);
          settle(layout);
          expect(layout.shown[0]).toBe(1);
        },
      ),
    );
  });

  it("gives the first slots in its order the room: the Earth's label is never the one that hides", () => {
    const crowd = Array.from({ length: LABEL_SLOTS }, () => ({ x: 860, y: 500, radius: 20 }));
    const layout = layoutOf(crowd);
    settle(layout);
    expect(layout.shown[0]).toBe(1);
    expect(shownSlots(layout).length).toBeLessThan(LABEL_SLOTS);
    const reversed = layoutOf(crowd);
    reversed.order.set([7, 6, 5, 4, 3, 2, 1, 0]);
    settle(reversed);
    expect(reversed.shown[7]).toBe(1);
    expect(reversed.side[7]).toBe(0);
    expect(reversed.shown[0]).toBe(0);
  });
});

describe("depth", () => {
  it("draws a far world's label smaller and fainter than a near one's, never under its floors", () => {
    const steps = [1, DEPTH.near, 15, 26, 40, DEPTH.far, 400];
    const layout = layoutOf(steps.map((away, index) => ({ x: 120 + index * 220, y: 500, radius: 10, away })));
    settle(layout);
    const scales = steps.map((_, slot) => at(layout.scale, slot));
    const fades = steps.map((_, slot) => at(layout.fade, slot));
    expect(scales[0]).toBe(1);
    expect(scales[1]).toBe(1);
    expect(fades[1]).toBe(1);
    for (let index = 2; index < steps.length - 1; index += 1) {
      expect(scales[index]).toBeLessThan(scales[index - 1] ?? NaN);
      expect(fades[index]).toBeLessThan(fades[index - 1] ?? NaN);
    }
    expect(scales.at(-1)).toBeCloseTo(DEPTH.scale, 9);
    expect(fades.at(-1)).toBeCloseTo(DEPTH.fade, 9);
    expect(scales.at(-2)).toBeCloseTo(DEPTH.scale, 9);
  });
});
