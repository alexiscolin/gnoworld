import { describe, expect, it } from "vitest";
import { Redraw, type Moment } from "./redraw.ts";

// Half a pixel at a distance of 100 with 0.001 radians a pixel is 0.05 world units; as a turn, 0.0005 radians.
const moment = (over: Partial<Moment> = {}): Moment => ({
  eye: [0, 0, 0, 0, 0, 0, 1],
  shown: [1, 0.5],
  pxK: 0.001,
  distance: 100,
  seconds: 0,
  pxPerSecond: 0,
  moving: false,
  ...over,
});
const turned = (angle: number): Moment["eye"] => [0, 0, 0, 0, 0, Math.sin(angle / 2), Math.cos(angle / 2)];

describe("Redraw", () => {
  it("draws the first frame, then nothing while nothing changes", () => {
    const redraw = new Redraw();
    expect(redraw.check(moment())).toBe("full");
    expect(redraw.check(moment({ seconds: 5 }))).toBe("none");
  });

  it("draws every frame while the hand, a flight, an effect or a close planet moves", () => {
    const redraw = new Redraw();
    redraw.check(moment());
    expect(redraw.check(moment({ moving: true }))).toBe("full");
    expect(redraw.check(moment({ moving: true }))).toBe("full");
  });

  it("draws when an eased value moves past its tolerance, and keeps the last drawn to measure by", () => {
    const redraw = new Redraw();
    redraw.check(moment());
    expect(redraw.check(moment({ shown: [1, 0.5002] }))).toBe("none");
    expect(redraw.check(moment({ shown: [1, 0.5006] }))).toBe("full");
    expect(redraw.check(moment({ shown: [1, 0.5006] }))).toBe("none");
  });

  it("draws when what shows changes its count", () => {
    const redraw = new Redraw();
    redraw.check(moment());
    expect(redraw.check(moment({ shown: [1, 0.5, 0] }))).toBe("full");
  });

  it("draws when a source tells it changed, once", () => {
    const redraw = new Redraw();
    redraw.check(moment());
    redraw.touch();
    expect(redraw.check(moment())).toBe("full");
    expect(redraw.check(moment())).toBe("none");
  });

  it("draws the camera's turn past half a pixel, and the sum of small ones", () => {
    const redraw = new Redraw();
    redraw.check(moment());
    expect(redraw.check(moment({ eye: turned(0.0003) }))).toBe("none");
    expect(redraw.check(moment({ eye: turned(0.0006) }))).toBe("ambient");
    expect(redraw.check(moment({ eye: turned(0.0006) }))).toBe("none");
  });

  it("draws the camera's move past half a pixel at its distance", () => {
    const redraw = new Redraw();
    redraw.check(moment());
    expect(redraw.check(moment({ eye: [0.04, 0, 0, 0, 0, 0, 1] }))).toBe("none");
    expect(redraw.check(moment({ eye: [0.06, 0, 0, 0, 0, 0, 1] }))).toBe("ambient");
  });

  it("draws a slow motion once it has moved half a pixel, by its pixels a second", () => {
    const redraw = new Redraw();
    redraw.check(moment({ pxPerSecond: 10 }));
    expect(redraw.check(moment({ pxPerSecond: 10, seconds: 0.04 }))).toBe("none");
    expect(redraw.check(moment({ pxPerSecond: 10, seconds: 0.06 }))).toBe("ambient");
    expect(redraw.check(moment({ pxPerSecond: 10, seconds: 0.07 }))).toBe("none");
  });
});
