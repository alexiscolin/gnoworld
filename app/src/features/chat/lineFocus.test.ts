import type { Line } from "@gnoworld/core";
import { describe, expect, it, vi } from "vitest";
import { nextLine, stopOf } from "./lineFocus.ts";

// The green pass (G5): the moves among a room's lines, read apart from the page (the app's tests render on the
// server, where no key is pressed).
const press = (key: string, held: Partial<Record<"altKey" | "ctrlKey" | "metaKey" | "shiftKey", boolean>> = {}) => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...held,
});

describe("the line a key moves the focus to", () => {
  it.each([
    ["ArrowUp", 1, 0],
    ["ArrowDown", 1, 2],
    ["ArrowUp", 0, 2],
    ["ArrowDown", 2, 0],
    ["Home", 1, 0],
    ["End", 1, 2],
  ])("is, for %s from line %i of three, line %i, round the ends", (key, from, to) => {
    expect(nextLine(press(key), 3, () => from)).toBe(to);
  });

  it.each(["altKey", "ctrlKey", "metaKey", "shiftKey"] as const)(
    "is none for a move held with %s, which is the browser's or the page's",
    (held) => {
      for (const key of ["ArrowUp", "ArrowDown", "Home", "End"])
        expect(nextLine(press(key, { [held]: true }), 3, () => 1)).toBeUndefined();
    },
  );

  it.each(["Tab", "Enter", " ", "a", "PageUp", "Escape"])(
    "is none for %j, read before any line is looked at",
    (key) => {
      const at = vi.fn(() => 1);
      expect(nextLine(press(key), 3, at)).toBeUndefined();
      expect(at).not.toHaveBeenCalled();
    },
  );

  it("is none for a key pressed on no line, as on a line's bar or its menu", () => {
    expect(nextLine(press("ArrowDown"), 3, () => -1)).toBeUndefined();
  });

  it("stays on a line alone", () => {
    expect(nextLine(press("ArrowDown"), 1, () => 0)).toBe(0);
    expect(nextLine(press("End"), 1, () => 0)).toBe(0);
  });
});

// The green pass (G7): the list's one tab stop, whatever became of the line chosen.
const line = (id: string): Line => ({ id, time: "2026-10-25T10:00:00.000Z", from: "n", text: id, kind: "message" });
const LINES = [line("a"), line("b"), line("c")];

describe("the list's tab stop", () => {
  it("is the line chosen while the list holds it", () => {
    expect(stopOf(LINES, "b")).toBe("b");
  });

  it.each([
    ["none chosen yet", undefined],
    ["the line chosen deleted or past the window", "gone"],
  ])("is the newest with %s", (_, chosen) => {
    expect(stopOf(LINES, chosen)).toBe("c");
  });

  it("is none in an empty list", () => {
    expect(stopOf([], "b")).toBeUndefined();
    expect(stopOf([], undefined)).toBeUndefined();
  });
});
