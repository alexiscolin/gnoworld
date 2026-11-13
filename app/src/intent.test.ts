// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { afterDwell, HOVER_MS } from "./intent.ts";

// The reader's intent: a pointer that rests on a link asks ahead, on a fast link alone; one that left, or a dwell called off, asks nothing.
const link = (matching: boolean) => {
  const element = document.createElement("a");
  vi.spyOn(element, "matches").mockReturnValue(matching);
  return element;
};
const connection = (effectiveType: string) => {
  Object.defineProperty(navigator, "connection", { value: { effectiveType, saveData: false }, configurable: true });
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "connection");
});

describe("afterDwell", () => {
  it("runs once the pointer rested HOVER_MS on a fast link, and not for one that left", () => {
    const run = vi.fn();
    afterDwell(link(true), run);
    afterDwell(link(false), run);
    vi.advanceTimersByTime(HOVER_MS);
    expect(run).toHaveBeenCalledOnce();
  });

  it("asks nothing ahead on a slow link", () => {
    connection("3g");
    const run = vi.fn();
    afterDwell(link(true), run);
    vi.advanceTimersByTime(HOVER_MS);
    expect(run).not.toHaveBeenCalled();
  });

  it("gives what calls the dwell off before its delay", () => {
    const run = vi.fn();
    const off = afterDwell(link(true), run);
    off();
    vi.advanceTimersByTime(HOVER_MS);
    expect(run).not.toHaveBeenCalled();
  });
});
