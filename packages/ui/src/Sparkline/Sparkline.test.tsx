import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Sparkline } from "./Sparkline.tsx";

// 8i: a price's day as a line; the drawing reads its values between their lowest and highest.
const svg = (container: HTMLElement) => container.querySelector("svg");
const pointsOf = (container: HTMLElement) =>
  (container.querySelector("polyline")?.getAttribute("points") ?? "")
    .split(" ")
    .map((pair) => pair.split(",").map(Number));

describe("Sparkline", () => {
  it("draws nothing for no value, one value, or one finite value among others", () => {
    for (const values of [[], [3], [1, Number.NaN], [Number.POSITIVE_INFINITY, 2]]) {
      expect(svg(render(<Sparkline values={values} tone="up" />).container)).toBeNull();
    }
  });

  it("draws a line of two values from the left edge to the right, the low at the foot and the high at the top", () => {
    const [first, last] = pointsOf(render(<Sparkline values={[1, 5]} tone="up" />).container);
    expect(first?.[0]).toBe(0);
    expect(last?.[0]).toBe(100);
    expect(first?.[1]).toBeGreaterThan(last?.[1] ?? 0);
  });

  it("keeps the line's ends inside the box, never cut in half", () => {
    const ys = pointsOf(render(<Sparkline values={[2, 9, 4]} tone="up" />).container).map(([, y]) => y ?? 0);
    expect(Math.min(...ys)).toBeGreaterThan(0);
    expect(Math.max(...ys)).toBeLessThan(32);
  });

  it("draws a level line in the middle when every value is the same", () => {
    const ys = pointsOf(render(<Sparkline values={[7, 7, 7]} tone="flat" />).container).map(([, y]) => y);
    expect(ys).toEqual([16, 16, 16]);
  });

  it("leaves out a value that is no finite number", () => {
    const points = pointsOf(render(<Sparkline values={[1, Number.NaN, 3]} tone="up" />).container);
    expect(points).toHaveLength(2);
  });

  it("carries the tone, and is hidden from assistive technology", () => {
    for (const tone of ["up", "down", "flat"] as const) {
      const drawn = svg(render(<Sparkline values={[1, 2]} tone={tone} />).container);
      expect(drawn?.getAttribute("data-tone")).toBe(tone);
      expect(drawn?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("gives each drawing its own gradient", () => {
    const ids = [1, 2].map(
      () => render(<Sparkline values={[1, 2]} tone="up" />).container.querySelector("linearGradient")?.id,
    );
    expect(ids[0]).not.toBe(ids[1]);
  });
});
