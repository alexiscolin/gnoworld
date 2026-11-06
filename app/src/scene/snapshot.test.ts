// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Drawn, recordDrawing } from "../../tests/drawing.ts";
import { FakeClock } from "../../tests/fakeClock.ts";
import { FrameLoop } from "./loop.ts";
import { copyOf } from "./snapshot.ts";

// A share's picture (slice 8): a copy of the canvas asked, from that canvas alone, made in the frame that draws it.
let drawn: Drawn[];
let restore: () => void;
beforeEach(() => {
  ({ drawn, restore } = recordDrawing());
});
afterEach(() => {
  restore();
});

const canvasOf = (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};
const REFRESH = 1000 / 60;

describe("the copy of a canvas", () => {
  it("is drawn from that canvas onto a new one of its size", () => {
    const source = canvasOf(640, 360);
    const copy = copyOf(source);
    expect(copy).not.toBe(source);
    expect(drawn).toEqual([{ onto: copy, from: source, width: 640, height: 360 }]);
    expect([copy?.width, copy?.height]).toEqual([640, 360]);
  });

  it("is scaled down to the widest a picture is, keeping the shape", () => {
    const copy = copyOf(canvasOf(3200, 1000));
    expect([copy?.width, copy?.height]).toEqual([1600, 500]);
    expect(drawn.map(({ width, height }) => [width, height])).toEqual([[1600, 500]]);
  });

  it("is none for a canvas with no size, and nothing is drawn", () => {
    expect(copyOf(canvasOf(0, 0))).toBeUndefined();
    expect(drawn).toHaveLength(0);
  });
});

describe("the loop's picture", () => {
  function started() {
    const clock = new FakeClock(60);
    const order: string[] = [];
    const loop = new FrameLoop(clock, () => {
      order.push(`draw:${String(drawn.length)}`);
    });
    clock.run(REFRESH * 3);
    return { clock, loop, order };
  }

  it("is a copy of the canvas asked, made after the next frame's draw and not before it", async () => {
    const { clock, loop, order } = started();
    const source = canvasOf(320, 200);
    const other = canvasOf(10, 10);
    const asked = loop.picture(source);
    expect(drawn).toHaveLength(0);
    clock.run(REFRESH * 2);
    const picture = await asked;
    expect(drawn).toEqual([{ onto: picture, from: source, width: 320, height: 200 }]);
    expect(drawn.some(({ from }) => from === other)).toBe(false);
    expect(order.at(-1)).toBe("draw:0");
  });

  it("answers each canvas asked in the same frame with its own copy, once", async () => {
    const { clock, loop } = started();
    const first = canvasOf(100, 50);
    const second = canvasOf(80, 40);
    const both = Promise.all([loop.picture(first), loop.picture(second)]);
    clock.run(REFRESH * 10);
    const [one, two] = await both;
    expect(drawn.map(({ onto, from }) => [onto, from])).toEqual([
      [one, first],
      [two, second],
    ]);
  });

  it("is never made once the loop is stopped", async () => {
    const { clock, loop } = started();
    loop.stop();
    let answered = false;
    loop.picture(canvasOf(100, 50)).then(
      () => {
        answered = true;
      },
      () => undefined,
    );
    clock.run(1000);
    await Promise.resolve();
    expect(answered).toBe(false);
    expect(drawn).toHaveLength(0);
  });
});
