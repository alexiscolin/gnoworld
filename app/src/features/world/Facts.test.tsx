// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Facts } from "./Facts.tsx";

// Slice 5j (frames 26 and 92): "38 here, right now" and "43 /h, messages now", two Stat blocks. A fact with no source is
// left out, never a zero or a sample (plan §1: "never a number without its source and age"); a source that says 0 is a 0.
let host: HTMLElement | undefined;
// jsdom has no matchMedia: every query answers no, so the figure's count-up stays still.
beforeEach(() => {
  vi.stubGlobal("matchMedia", (media: string) => ({ matches: false, media }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  host?.remove();
  host = undefined;
});
function draw(props: { here?: number; perHour?: number }) {
  host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(<Facts {...props} />);
  });
  return host;
}
const captions = (el: HTMLElement) => [...el.querySelectorAll(".label")].map((node) => node.textContent);

describe("a world's facts", () => {
  it("shows both facts, each with its caption, when the chat knows both", () => {
    const el = draw({ here: 38, perHour: 43 });
    expect(captions(el)).toEqual(["right now", "messages now"]);
    expect(el.textContent).toContain("here");
    expect(el.textContent).toContain("/h");
    expect([...el.querySelectorAll("[data-value]")].map((node) => node.getAttribute("data-value"))).toEqual([
      "38",
      "43",
    ]);
  });

  it("leaves out the fact with no source, and shows no zero in its place", () => {
    const el = draw({ here: 3 });
    expect(captions(el)).toEqual(["right now"]);
    expect(el.querySelectorAll("[data-value]")).toHaveLength(1);
  });

  it("shows a real 0 as a 0", () => {
    const el = draw({ here: 0, perHour: 0 });
    expect([...el.querySelectorAll("[data-value]")].map((node) => node.getAttribute("data-value"))).toEqual(["0", "0"]);
  });

  it("draws nothing at all when neither fact has a source", () => {
    expect(draw({}).childElementCount).toBe(0);
  });

  it("counts a source that is no count as no source: never a 0 in its place", () => {
    for (const props of [{ here: Number.NaN }, { perHour: Number.POSITIVE_INFINITY }, { here: -1 }]) {
      const el = draw(props);
      expect(el.querySelectorAll("[data-value]")).toHaveLength(0);
      host?.remove();
    }
    const el = draw({ here: Number.NaN, perHour: 5 });
    expect(captions(el)).toEqual(["messages now"]);
  });

  it("shows a rate as a whole number, as the frame does", () => {
    const el = draw({ perHour: 43.7 });
    expect(el.querySelector("[data-value]")?.getAttribute("data-value")).toBe("44");
  });
});
