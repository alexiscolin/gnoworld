// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Activity } from "./Activity.tsx";

// Slice 5j (frame 26): "ACTIVITY · LAST 24 H", the rate now, "24 H AGO", the peak, "NOW". With no history the block says
// so in words and draws no chart.
const day = Array.from({ length: 24 }, (_, hour) => (hour === 18 ? 43 : hour));
let host: HTMLElement | undefined;
afterEach(() => {
  host?.remove();
  host = undefined;
});
// The bars load apart (Activity.tsx): a history is drawn once they have.
async function draw(hours: number[] | undefined) {
  host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<Activity hours={hours} />);
    await Promise.resolve();
  });
  if (hours !== undefined && hours.length > 0)
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

  it("writes the rate now at the right of the title, then the bars, then 24 h ago, the peak and now, in that order", async () => {
    const el = await draw(day);
    const text = el.textContent;
    const at = (part: RegExp) => text.search(part);
    expect(at(/activity\s*·\s*last 24 h/i)).toBeLessThan(at(/23 msgs\/h now/i));
    expect(at(/23 msgs\/h now/i)).toBeLessThan(at(/24 h ago/i));
    expect(at(/24 h ago/i)).toBeLessThan(at(/peak 43\/h/i));
    expect(at(/peak 43\/h/i)).toBeLessThan(text.lastIndexOf("now"));
    // "now" stands alone at the right of the axis, apart from the rate's.
    const labels = [...el.querySelectorAll("p.label")].map((node) => node.textContent);
    expect(labels.at(-1)).toBe("now");
    expect(labels.at(-3)).toBe("24 h ago");
    expect(text.match(/peak 43\/h/gi)).toHaveLength(1);
  });

  it("says the hours it holds, never 24 for a shorter history", async () => {
    const el = await draw([1, 2, 3, 4, 5]);
    expect(el.textContent).toMatch(/5 h ago/);
    expect(el.textContent).not.toMatch(/24 h ago/);
  });

  it("writes a peak of 0 for a history of none, and no NaN or negative for a value that is no count", async () => {
    expect((await draw(Array.from({ length: 24 }, () => 0))).textContent).toMatch(/peak 0\/h/i);
    host?.remove();
    const text = (await draw([Number.NaN, -1, 3])).textContent;
    expect(text).toMatch(/peak 3\/h/i);
    expect(text).toMatch(/3 msgs\/h now/i);
    expect(text).not.toMatch(/NaN|-1|undefined/);
  });

  it("says in words that no activity is known, and draws no chart, with no history", () => {
    for (const hours of [undefined, []]) {
      const html = renderToStaticMarkup(<Activity hours={hours} />);
      expect(html).toMatch(/no activity (recorded|known) yet/i);
      expect(html).not.toMatch(/<svg|data-hour|<table/);
    }
  });
});
