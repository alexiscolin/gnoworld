// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Activity } from "./Activity.tsx";

// Slice 5j (frames 26 and 40), 8g: "ACTIVITY · LAST 24 H" and the rate now over the bars, "24 H AGO", the peak with its hour and "NOW" under
// them, from the server's hours (useHours.ts). With no history the chart is drawn flat, named as no activity yet.
const FROM = Date.UTC(2026, 10, 3, 16);
const day = Array.from({ length: 24 }, (_, hour) => (hour === 18 ? 43 : hour));
const hoursOf = (counts: (number | null)[], now: number | null = null) => ({ from: FROM, hours: counts, now });
let host: HTMLElement | undefined;
afterEach(() => {
  host?.remove();
  host = undefined;
});
// The bars load apart (Activity.tsx): a history is drawn once they have.
async function draw(counts: (number | null)[] | undefined, now: number | null = null, always = false) {
  host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<Activity hours={counts === undefined ? undefined : hoursOf(counts, now)} />);
    await Promise.resolve();
  });
  if (always || (counts !== undefined && counts.length > 0))
    await vi.waitFor(() => {
      expect(host?.querySelector("svg")).not.toBeNull();
    });
  return host;
}

describe("a world's activity", () => {
  it("is titled as the frame writes it, and holds the 24 bars", async () => {
    const el = await draw(day);
    expect(el.textContent).toMatch(/activity\s*·\s*last 24 h/i);
    expect(el.querySelectorAll("svg [data-hour]")).toHaveLength(24);
  });

  it("writes the title and the rate now, the bars, then 24 h ago, the peak with its hour and now, each once (F2867)", async () => {
    const el = await draw(day, 30);
    const text = el.textContent;
    const at = (part: RegExp) => text.search(part);
    expect(at(/activity\s*·\s*last 24 h/i)).toBeLessThan(at(/30 msgs\/h now/i));
    expect(at(/30 msgs\/h now/i)).toBeLessThan(at(/24 h ago/i));
    expect(at(/24 h ago/i)).toBeLessThan(at(/peak 43\/h/i));
    expect(text.match(/peak/gi)).toHaveLength(1);
    const peak = el.querySelector("time");
    expect(peak?.getAttribute("dateTime")).toBe(new Date(FROM + 18 * 3_600_000).toISOString());
  });

  it("says the last hour's count as the rate now when the server gave no pace", async () => {
    expect((await draw(day)).textContent).toMatch(/23 msgs\/h now/i);
  });

  it("writes a peak of 0 for a history of none, and no NaN or negative for a value that is no count", async () => {
    expect((await draw(Array.from({ length: 24 }, () => 0))).textContent).toMatch(/peak 0/i);
    host?.remove();
    const text = (await draw([Number.NaN, -1, 3, null])).textContent;
    expect(text).toMatch(/peak 3/i);
    expect(text).not.toMatch(/NaN|-1|undefined|null/);
  });

  it("draws the chart flat, with its words, a rate of 0 and no peak hour, with no history", async () => {
    for (const counts of [undefined, []]) {
      const el = await draw(counts, null, true);
      expect(el.textContent).toMatch(/activity\s*·\s*last 24 h/i);
      expect(el.textContent).toMatch(/0 msgs\/h now/i);
      expect(el.textContent).toMatch(/24 h ago/i);
      expect(el.textContent).toMatch(/now$/i);
      expect(el.textContent).toMatch(/peak 0\/h/i);
      expect(el.querySelector("time")).toBeNull();
      const bars = [...el.querySelectorAll("svg [data-hour]")];
      expect(bars).toHaveLength(24);
      expect(bars.every((bar) => bar.getAttribute("height") === "0")).toBe(true);
      expect(el.querySelector('[role="group"]')?.getAttribute("aria-label")).toMatch(/no activity recorded yet/i);
      host?.remove();
    }
  });
});
