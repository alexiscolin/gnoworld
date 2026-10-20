import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eachStory, staysText } from "../testing.tsx";
import { Stat } from "./Stat.tsx";
import * as stories from "./Stat.stories.tsx";

// The figure as drawn, and the words assistive technology reads: the text outside what it is told
// to leave alone.
const drawn = (container: HTMLElement) => container.querySelector("[data-value]")?.textContent;
function spoken(container: HTMLElement) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let said = "";
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode())
    if (node.parentElement?.closest("[aria-hidden='true']") === null) said += node.textContent ?? "";
  return said;
}

// The reader's motion setting, as the browser answers it; jsdom answers no to every query.
function motion(allowed: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-reduced-motion: no-preference)" && allowed,
    media: query,
  }));
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance", "setTimeout"] });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("Stat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("writes its number in English's grouping, the app's one language, its unit and its caption", () => {
    const { container } = render(<Stat value={21480} unit="calls" caption="Today" />);
    const number = container.querySelector<HTMLElement>("[data-value]");
    expect(number?.dataset["value"]).toBe("21480");
    expect(drawn(container)).toBe("21,480");
    expect(screen.getByText("calls")).toBeTruthy();
    expect(screen.getByText("Today")).toBeTruthy();
  });

  it("counts up to its value on arrival, never back, and lands on it within the arrival's 1.2 s", () => {
    motion(true);
    const { container } = render(<Stat value={21480} unit="calls" caption="Today" />);
    const seen = [drawn(container)];
    for (let ms = 0; ms < 1_200; ms += 100) {
      advance(100);
      seen.push(drawn(container));
    }
    const values = seen.map((text) => Number((text ?? "").replaceAll(",", "")));
    expect(values[0]).toBe(0);
    expect(values.some((v) => v > 0 && v < 21480)).toBe(true);
    expect(values.every((v, at) => at === 0 || v >= (values[at - 1] ?? 0))).toBe(true);
    expect(values.at(-1)).toBe(21480);
  });

  it("stands at its value at once under reduced motion", () => {
    motion(false);
    const { container } = render(<Stat value={21480} caption="Today" />);
    expect(drawn(container)).toBe("21,480");
  });

  it("says only its value to assistive technology, never a count on its way", () => {
    motion(true);
    const { container } = render(<Stat value={21480} unit="calls" caption="Today" />);
    advance(300);
    expect(drawn(container)).not.toBe("21,480");
    expect(spoken(container).match(/[\d,]+ calls/g)).toEqual(["21,480 calls"]);
  });

  it("stops its count when it leaves the page", () => {
    motion(true);
    const { unmount } = render(<Stat value={21480} caption="Today" />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("says its delta in words, not by colour alone: up, down, or unchanged", () => {
    const { rerender } = render(<Stat value={12} caption="Here now" delta={3} />);
    const delta = () => screen.getByText(/than yesterday|as yesterday/);
    expect(delta().textContent).toBe("3 more than yesterday");
    expect(delta().dataset["trend"]).toBe("up");
    rerender(<Stat value={12} caption="Here now" delta={-4} />);
    expect(delta().textContent).toBe("4 fewer than yesterday");
    expect(delta().dataset["trend"]).toBe("down");
    rerender(<Stat value={12} caption="Here now" delta={0} />);
    expect(delta().textContent).toBe("the same as yesterday");
    expect(delta().dataset["trend"]).toBe("flat");
  });

  it("wears the heat badge only when hot, and says so", () => {
    const { rerender } = render(<Stat value={214} caption="Here now" />);
    expect(screen.queryByText("Hot")).toBeNull();
    rerender(<Stat value={214} caption="Here now" hot />);
    expect(screen.getByText("Hot")).toBeTruthy();
  });

  it("shows a unit and a caption made of markup, or very long, as text", () => {
    staysText((text) => <Stat value={1} unit={text} caption={text} />);
  });

  it("has stories with a unit, each delta and the heat badge", () => {
    const shown = eachStory(stories, (container) => ({
      trends: [...container.querySelectorAll<HTMLElement>("[data-trend]")].map((d) => d.dataset["trend"]),
      hot: container.textContent.includes("Hot"),
    }));
    const trends = shown.flatMap((s) => s.trends);
    for (const trend of ["up", "down", "flat"]) expect(trends).toContain(trend);
    expect(shown.some((s) => s.hot)).toBe(true);
  });
});
