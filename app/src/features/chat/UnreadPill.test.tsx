// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { all, markup } from "../../../tests/mount.tsx";
import { UnreadPill } from "./UnreadPill.tsx";

// A world's pill of lines not yet seen: its number to 99, 99+ past it, nothing for none, and the words a screen reader hears.
const pill = (count: number) => markup(<UnreadPill count={count} />);

describe("UnreadPill", () => {
  it("draws nothing for 0, a negative count or a fraction under 1", () => {
    for (const count of [0, -3, 0.4]) expect(pill(count).textContent).toBe("");
  });

  it("says the number: 7, and 99", () => {
    for (const count of [7, 99]) {
      const box = pill(count);
      expect(all(box, '[aria-hidden="true"]').map((each) => each.textContent)).toEqual([String(count)]);
    }
  });

  it("says 99+ for 100 and for any count past it", () => {
    for (const count of [100, 5_000]) {
      expect(all(pill(count), '[aria-hidden="true"]').map((each) => each.textContent)).toEqual(["99+"]);
    }
  });

  it("tells a screen reader the same count and what it counts, once", () => {
    expect(all(pill(7), ".visually-hidden").map((each) => each.textContent)).toEqual(["7 unread"]);
    expect(all(pill(100), ".visually-hidden").map((each) => each.textContent)).toEqual(["99+ unread"]);
  });
});
