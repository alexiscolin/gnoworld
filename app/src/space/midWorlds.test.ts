// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fillPill, tagOf } from "./midWorlds.ts";
import type { Planet } from "./layout.ts";

// P300: a pill's count is written only when it changes, so a drawn frame at rest leaves the document alone.
const planet = { id: "w", radius: 1, index: 0 } as unknown as Planet;
const place = (button: HTMLElement, fact: number | undefined) => {
  tagOf(button, {
    seen: undefined,
    at: { x: 0, y: 0, z: 0 },
    item: planet,
    on: { x: 1, y: 2, z: 0 },
    arrival: false,
    fact: () => fact,
  });
};

describe("tagOf's count", () => {
  it("writes nothing when the number is the same, and shows and hides it as the number comes and goes", () => {
    const button = document.createElement("button");
    fillPill(button);
    const count = button.children[1] as HTMLElement;
    place(button, undefined);
    expect(count.hidden).toBe(true);
    const seen: MutationRecord[] = [];
    const watch = new MutationObserver((rows) => seen.push(...rows));
    watch.observe(count, { attributes: true, characterData: true, subtree: true, childList: true });
    place(button, undefined);
    place(button, undefined);
    expect(watch.takeRecords()).toHaveLength(0);
    place(button, 3);
    expect(count.hidden).toBe(false);
    expect(count.textContent).toBe("3");
    watch.takeRecords();
    place(button, 3);
    expect(watch.takeRecords()).toHaveLength(0);
    place(button, 0);
    expect(count.hidden).toBe(true);
    watch.disconnect();
  });
});
