import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { eachStory, staysText } from "../testing.tsx";
import { ActivityChart } from "./ActivityChart.tsx";
import * as stories from "./ActivityChart.stories.tsx";

const day = Array.from({ length: 24 }, (_, hour) => (hour === 18 ? 96 : hour));
// Everything the chart writes, as text and in its attributes.
const written = (container: HTMLElement) =>
  [
    container.textContent,
    ...[...container.querySelectorAll("*")].flatMap((e) => [...e.attributes].map((a) => a.value)),
  ].join(" ");
const heights = (container: HTMLElement) =>
  [...container.querySelectorAll("svg [data-hour]")].map((b) => Number(b.getAttribute("height")));
// Each row of the table as its words: when, and how many.
const rows = (label: string) =>
  [...screen.getByRole("table", { name: label }).querySelectorAll("tbody tr")].map((row) =>
    [...row.children].map((cell) => cell.textContent),
  );

describe("ActivityChart", () => {
  it("draws 24 bars, the last one the current hour, and none of them read aloud", () => {
    const { container } = render(<ActivityChart label="Calls per hour, today" values={day} />);
    const bars = container.querySelectorAll("svg [data-hour]");
    expect(bars).toHaveLength(24);
    expect(
      [...bars].filter((b) => b.getAttribute("data-current") === "true").map((b) => b.getAttribute("data-hour")),
    ).toEqual(["23"]);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("writes the peak and the current value", () => {
    render(<ActivityChart label="Calls per hour, today" values={day} />);
    expect(screen.getByText("Peak 96")).toBeTruthy();
    expect(screen.getByText("Now 23")).toBeTruthy();
  });

  it("says every value as text, each beside its hour, the last this hour", () => {
    render(<ActivityChart label="Calls per hour, today" values={day} />);
    const said = rows("Calls per hour, today");
    expect(said).toHaveLength(24);
    expect(said[0]).toEqual(["23 hours ago", "0"]);
    expect(said[18]).toEqual(["5 hours ago", "96"]);
    expect(said[22]).toEqual(["1 hour ago", "22"]);
    expect(said[23]).toEqual(["This hour", "23"]);
  });

  it("scales the bars to the peak, so the tallest fills the height and none is negative", () => {
    const { container } = render(<ActivityChart label="Calls" values={[0, 5, 10]} />);
    const tall = heights(container);
    expect(tall[1]).toBeGreaterThan(tall[0] ?? 0);
    expect(tall[2]).toBeGreaterThan(tall[1] ?? 0);
    expect(tall[0]).toBe(0);
    expect(Math.max(...tall)).toBe(Number(container.querySelector("svg")?.getAttribute("height")));
  });

  it("stands its bars on the baseline, in order, each beside the last and none over another", () => {
    const { container } = render(<ActivityChart label="Calls" values={[3, 9, 4, 7]} />);
    const height = Number(container.querySelector("svg")?.getAttribute("height"));
    const bars = [...container.querySelectorAll("svg [data-hour]")].map((b) => {
      const read = (name: string) => Number(b.getAttribute(name));
      return { x: read("x"), y: read("y"), width: read("width"), tall: read("height") };
    });
    expect(bars.map(({ y, tall }) => y + tall)).toEqual(bars.map(() => height));
    expect(bars.every(({ x, width }) => x >= 0 && width > 0)).toBe(true);
    const gaps = bars.slice(1).map((bar, at) => bar.x - ((bars[at]?.x ?? 0) + (bars[at]?.width ?? 0)));
    expect(gaps.every((gap) => gap >= 0)).toBe(true);
  });

  it("draws a value of one beside a peak of thousands, never as none", () => {
    const { container } = render(<ActivityChart label="Calls" values={[1, 5_000]} />);
    expect(heights(container)[0]).toBeGreaterThanOrEqual(1);
  });

  // Its line is --line-width wide (1 px) and centred on its points: at the drawing's edge half of it
  // was cut. The peak and zero sit half a pixel in, of a drawing 48 high (F337).
  it.each([
    [
      [0, 3, 0],
      [47.5, 0.5, 47.5],
    ],
    [
      [5, 5, 5],
      [0.5, 0.5, 0.5],
    ],
    [
      [0, 0, 0],
      [47.5, 47.5, 47.5],
    ],
    [[7], [0.5, 0.5]],
    [[0], [47.5, 47.5]],
  ])("keeps its sparkline's whole stroke inside its drawing: %j", (values, expected) => {
    const { container } = render(<ActivityChart label="Calls" values={values} sparkline unit="day" />);
    expect(container.querySelector("svg")?.getAttribute("viewBox")?.split(" ")[3]).toBe("48");
    const ys = (container.querySelector("polyline")?.getAttribute("points") ?? "")
      .split(" ")
      .map((point) => Number(point.split(",")[1]));
    expect(ys).toEqual(expected);
  });

  it("keeps a whole day's sparkline inside its drawing, its peak half a pixel in", () => {
    const { container } = render(<ActivityChart label="Calls" values={day} sparkline unit="day" />);
    const ys = (container.querySelector("polyline")?.getAttribute("points") ?? "")
      .split(" ")
      .map((point) => Number(point.split(",")[1]));
    expect(Math.min(...ys)).toBe(0.5);
    expect(Math.max(...ys)).toBeLessThanOrEqual(47.5);
  });

  it("draws a sparkline of one value as a level line, never an empty drawing", () => {
    const { container } = render(<ActivityChart label="Calls" values={[7]} sparkline unit="day" />);
    const [, , width] = (container.querySelector("svg")?.getAttribute("viewBox") ?? "").split(" ").map(Number);
    const points = (container.querySelector("polyline")?.getAttribute("points") ?? "").split(" ");
    expect(width).toBeGreaterThan(0);
    expect(points).toHaveLength(2);
    expect(new Set(points.map((point) => point.split(",")[1])).size).toBe(1);
  });

  it("draws a flat day without dividing by zero", () => {
    const { container } = render(<ActivityChart label="Calls" values={[0, 0, 0]} />);
    expect(heights(container)).toEqual([0, 0, 0]);
  });

  it("counts a negative or missing value as none, in the bars and in the words", () => {
    const { container } = render(<ActivityChart label="Calls" values={[-5, Number.NaN, 10]} />);
    expect(heights(container).every((h) => Number.isFinite(h) && h >= 0)).toBe(true);
    expect(rows("Calls").map(([, value]) => value)).toEqual(["0", "0", "10"]);
    expect(written(container)).not.toContain("NaN");
  });

  it("draws nothing, and says nothing happened, from no values at all", () => {
    const { container } = render(<ActivityChart label="Calls" values={[]} />);
    expect(heights(container)).toEqual([]);
    expect(screen.getByText("Peak 0")).toBeTruthy();
    expect(screen.getByText("Now 0")).toBeTruthy();
    expect(written(container)).not.toMatch(/NaN|Infinity/);
  });

  it("draws a sparkline as one line from its first value to its last, its peak at the top", () => {
    const { container } = render(<ActivityChart label="Calls this week" values={[3, 9, 4, 0]} sparkline unit="day" />);
    const lines = container.querySelectorAll("svg polyline");
    expect(lines).toHaveLength(1);
    const points = (lines[0]?.getAttribute("points") ?? "").split(" ").map((p) => p.split(",").map(Number));
    const height = Number(container.querySelector("svg")?.getAttribute("height"));
    expect(points).toHaveLength(4);
    expect(points[0]?.[0]).toBe(0);
    const steps = points.slice(1).map((point, at) => (point[0] ?? 0) - (points[at]?.[0] ?? 0));
    expect(new Set(steps).size).toBe(1);
    expect(steps[0]).toBeGreaterThan(0);
    // Half a pixel in, so the line's stroke is whole (F337).
    expect(points[1]?.[1]).toBe(0.5);
    expect(points[3]?.[1]).toBe(height - 0.5);
    expect(rows("Calls this week").at(-1)).toEqual(["Today", "0"]);
    expect(rows("Calls this week")[0]).toEqual(["3 days ago", "3"]);
  });

  it("shows a label made of markup, or very long, as text", () => {
    staysText((text) => <ActivityChart label={text} values={[1, 2]} />);
  });

  it("has stories for a day of bars and a sparkline", () => {
    const shown = eachStory(stories, (container) => ({
      bars: container.querySelectorAll("svg [data-hour]").length,
      lines: container.querySelectorAll("svg polyline").length,
    }));
    expect(shown.some((s) => s.bars === 24) && shown.some((s) => s.lines === 1)).toBe(true);
  });
});
