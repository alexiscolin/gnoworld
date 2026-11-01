import { act, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
// The sparkline's points, their heights alone.
const ys = (container: HTMLElement) =>
  (container.querySelector("polyline")?.getAttribute("points") ?? "")
    .split(" ")
    .map((point) => Number(point.split(",")[1]));
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
    expect(ys(container)).toEqual(expected);
  });

  it("keeps a whole day's sparkline inside its drawing, its peak half a pixel in", () => {
    const { container } = render(<ActivityChart label="Calls" values={day} sparkline unit="day" />);
    expect(Math.min(...ys(container))).toBe(0.5);
    expect(Math.max(...ys(container))).toBeLessThanOrEqual(47.5);
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

// F304 (slice 5j): DESIGN-SYSTEM.md's table gives the bars a hover tooltip: the count and the hour of the bar under the
// pointer, as the table says them. The keyboard reaches the same words: the chart is one group, its arrows walk the bars.
// The queries are anchored on the tooltip's own words: the chart's hidden table holds "This hour" and "N hours ago" rows too.
describe("ActivityChart's tooltip (F304)", () => {
  const draw = () => render(<ActivityChart label="Calls per hour, today" values={day} />);
  const bar = (container: HTMLElement, hour: number) => {
    const found = container.querySelector(`svg [data-hour="${String(hour)}"]`);
    if (found === null) throw new Error(`no bar ${String(hour)}`);
    return found;
  };
  // The pointer in an hour's column: a 24-slot plot 192 px wide (8 px an hour), as the drawing's own units stretch to the box.
  const plotAt = (container: HTMLElement, slots = 24) => {
    const plot = container.querySelector("[role='group']");
    if (!(plot instanceof HTMLElement)) throw new Error("no plot");
    plot.getBoundingClientRect = () => new DOMRect(0, 0, slots * 8, 48);
    return plot;
  };
  const over = (container: HTMLElement, hour: number, slots = 24) => {
    fireEvent.pointerMove(plotAt(container, slots), { clientX: hour * 8 + 4, clientY: 10 });
  };
  const away = (container: HTMLElement) => {
    fireEvent.pointerLeave(plotAt(container));
  };
  const words = (count: number, when: string) => screen.queryByText(new RegExp(`^${String(count)}\\s*·\\s*${when}$`));
  const anyWords = () => screen.queryByText(/^\d+\s*·\s*(This hour|Today|\d+ (hours?|days?) ago)$/);
  const group = () => screen.getByRole("group", { name: "Calls per hour, today" });
  // The focus the keyboard brings: Tab first, as jsdom's :focus-visible reads the events before the focus.
  const focus = () => {
    const chart = group();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Tab" });
    act(() => {
      chart.focus();
    });
    return chart;
  };

  it("shows the count and the hour of the bar under the pointer, and no words before", () => {
    const { container } = draw();
    expect(anyWords()).toBeNull();
    over(container, 18);
    expect(words(96, "5 hours ago")).not.toBeNull();
  });

  it("follows the pointer to another bar and leaves with it", () => {
    const { container } = draw();
    over(container, 18);
    over(container, 23);
    expect(words(96, "5 hours ago")).toBeNull();
    expect(words(23, "This hour")).not.toBeNull();
    away(container);
    expect(anyWords()).toBeNull();
  });

  it("is reached from the keyboard: the chart takes the focus, the arrows walk the bars, Escape hides the words", () => {
    draw();
    expect(group().getAttribute("tabindex")).toBe("0");
    const chart = focus();
    // The focus lands on the current hour, the last bar.
    expect(words(23, "This hour")).not.toBeNull();
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(words(22, "1 hour ago")).not.toBeNull();
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    expect(words(23, "This hour")).not.toBeNull();
    fireEvent.keyDown(chart, { key: "Home" });
    expect(words(0, "23 hours ago")).not.toBeNull();
    fireEvent.keyDown(chart, { key: "End" });
    expect(words(23, "This hour")).not.toBeNull();
    fireEvent.keyDown(chart, { key: "Escape" });
    expect(anyWords()).toBeNull();
  });

  it("stays on the first and the last bar at the ends, and wraps to none", () => {
    draw();
    const chart = focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    expect(words(23, "This hour")).not.toBeNull();
    fireEvent.keyDown(chart, { key: "Home" });
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(words(0, "23 hours ago")).not.toBeNull();
  });

  it("hides the words when the focus leaves the chart", () => {
    draw();
    focus();
    expect(anyWords()).not.toBeNull();
    act(() => {
      group().blur();
    });
    expect(anyWords()).toBeNull();
  });

  it("keeps the focus's words when the pointer leaves, and the pointer's when the focus does (F334's class)", () => {
    const { container } = draw();
    focus();
    over(container, 18);
    expect(words(96, "5 hours ago")).not.toBeNull();
    away(container);
    expect(words(23, "This hour")).not.toBeNull();
    over(container, 18);
    act(() => {
      group().blur();
    });
    expect(words(96, "5 hours ago")).not.toBeNull();
  });

  // A click or a tap: the pointer goes down, then the browser focuses the group, which is no keyboard focus.
  const clickFocus = (target: Element) => {
    fireEvent.pointerDown(target);
    fireEvent.mouseDown(target);
    act(() => {
      group().focus();
    });
  };

  it("holds no words after a mouse click on a bar once the pointer has left it (F2862)", () => {
    const { container } = draw();
    over(container, 5);
    clickFocus(bar(container, 5));
    away(container);
    expect(anyWords()).toBeNull();
  });

  it("shows a tapped bar's own count while the finger is on it, never the last bar's (F2862)", () => {
    const { container } = draw();
    over(container, 18);
    clickFocus(bar(container, 18));
    expect(words(96, "5 hours ago")).not.toBeNull();
    expect(words(23, "This hour")).toBeNull();
    away(container);
    expect(anyWords()).toBeNull();
  });

  it("shows the hour of the column the pointer is in, over a zero hour, a short bar's column or the gap, not only the ink (F2863)", () => {
    const { container } = render(<ActivityChart label="Calls per hour, today" values={day} />);
    // Hour 0 is a zero: a bar of no height, never under a pointer before.
    over(container, 0);
    expect(words(0, "23 hours ago")).not.toBeNull();
    // The gap after a bar still belongs to its hour's slot.
    fireEvent.pointerMove(plotAt(container), { clientX: 18 * 8 + 7, clientY: 1 });
    expect(words(96, "5 hours ago")).not.toBeNull();
    // The plot's edges give the first and the last hour, never one past them.
    fireEvent.pointerMove(plotAt(container), { clientX: -5 });
    expect(words(0, "23 hours ago")).not.toBeNull();
    fireEvent.pointerMove(plotAt(container), { clientX: 400 });
    expect(words(23, "This hour")).not.toBeNull();
    away(container);
    expect(anyWords()).toBeNull();
  });

  it("keeps the words while the pointer moves onto them, and hides them when it leaves the plot (F2863, WCAG 1.4.13)", () => {
    const { container } = draw();
    over(container, 18);
    const tip = screen.getByText(/^96\s*·\s*5 hours ago$/);
    // The words are inside the plot and take the pointer: moving onto them keeps the bar.
    fireEvent.pointerMove(tip, { clientX: 200, clientY: -20 });
    expect(words(96, "5 hours ago")).not.toBeNull();
    away(container);
    expect(anyWords()).toBeNull();
  });

  it("shows the words again when the pointer or the focus comes after Escape", () => {
    const { container } = draw();
    over(container, 18);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(anyWords()).toBeNull();
    away(container);
    over(container, 5);
    expect(words(5, "18 hours ago")).not.toBeNull();
  });

  it("takes the first Escape, before a dialog around it: the dialog is not asked to close (F300's class)", () => {
    const around = vi.fn();
    const { container } = render(
      <div onKeyDown={around}>
        <ActivityChart label="Calls per hour, today" values={day} />
      </div>,
    );
    over(container, 18);
    const first = createEvent.keyDown(document.body, { key: "Escape" });
    fireEvent(document.body, first);
    expect(first.defaultPrevented).toBe(true);
    expect(anyWords()).toBeNull();
    // Nothing shown, so the next Escape is the dialog's.
    const second = createEvent.keyDown(document.body, { key: "Escape" });
    fireEvent(document.body, second);
    expect(second.defaultPrevented).toBe(false);
    expect(around).not.toHaveBeenCalled();
  });

  it("keeps the table as the one reading for assistive technology: the words are hidden from it", () => {
    const { container } = draw();
    over(container, 18);
    const shown = words(96, "5 hours ago");
    expect(shown).not.toBeNull();
    expect(shown?.closest("[aria-hidden='true']")).not.toBeNull();
  });

  it("says the focused bar to assistive technology in a polite live region, which the table does not", () => {
    draw();
    expect(screen.getByRole("status").textContent).toBe("");
    const chart = focus();
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(screen.getByRole("status").textContent).toBe("1 hour ago, 22");
    act(() => {
      chart.blur();
    });
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("writes a day chart's words as the table does: Today, and 3 days ago", () => {
    const { container } = render(<ActivityChart label="Calls this week" values={[3, 1, 2, 0]} unit="day" />);
    over(container, 3, 4);
    expect(screen.queryByText(/^0\s*·\s*Today$/)).not.toBeNull();
    over(container, 0, 4);
    expect(screen.queryByText(/^3\s*·\s*3 days ago$/)).not.toBeNull();
  });

  it("leaves a sparkline, and a chart with no value, with no focus stop and no tooltip", () => {
    const { rerender } = render(<ActivityChart label="Calls" values={[1, 2, 3]} sparkline />);
    expect(screen.queryByRole("group")).toBeNull();
    expect(document.querySelector("[tabindex]")).toBeNull();
    rerender(<ActivityChart label="Calls" values={[]} />);
    expect(screen.queryByRole("group")).toBeNull();
    expect(document.querySelector("[tabindex]")).toBeNull();
    expect(anyWords()).toBeNull();
    expect(screen.queryByText(/NaN|undefined/)).toBeNull();
  });
});
