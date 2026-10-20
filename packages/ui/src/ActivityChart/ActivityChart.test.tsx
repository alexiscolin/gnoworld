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
    expect(points[1]?.[1]).toBe(0);
    expect(points[3]?.[1]).toBe(height);
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
