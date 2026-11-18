// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { awayFromEnd, FAR, followLines, NEAR, nextFold } from "./bandFold.ts";

// The scrolling box, whose child is the Messages list.
const scroller = () => {
  const box = document.createElement("div");
  const list = document.createElement("ol");
  list.setAttribute("aria-label", "Messages");
  box.append(list);
  return box;
};

describe("the place band's fold", () => {
  it("measures how far a list, whose scroll origin is its foot, is scrolled from its end", () => {
    expect(awayFromEnd({ scrollTop: -300 })).toBe(300);
    expect(awayFromEnd({ scrollTop: 0 })).toBe(0);
  });

  it("folds only once the lines are far from their end, and unfolds only near it (no flicker as the band's own height moves the end)", () => {
    expect(nextFold(false, FAR)).toBe(false);
    expect(nextFold(false, FAR + 1)).toBe(true);
    expect(nextFold(true, FAR)).toBe(true);
    expect(nextFold(true, NEAR + 1)).toBe(true);
    expect(nextFold(true, NEAR)).toBe(false);
  });

  it("follows the Messages list's scroll alone, and says each change", () => {
    const screen = document.createElement("div");
    const list = scroller();
    const field = document.createElement("textarea");
    screen.append(list, field);
    const told: boolean[] = [];
    const stop = new AbortController();
    followLines(screen, (fold) => told.push(fold(told.at(-1) ?? false)), stop.signal);
    list.scrollTop = -1600;
    list.dispatchEvent(new Event("scroll"));
    field.dispatchEvent(new Event("scroll"));
    expect(told).toEqual([true]);
    list.scrollTop = 0;
    list.dispatchEvent(new Event("scroll"));
    expect(told).toEqual([true, false]);
    stop.abort();
    list.scrollTop = -1600;
    list.dispatchEvent(new Event("scroll"));
    expect(told).toHaveLength(2);
  });

  it("never folds while the focus is inside the band: the control being used stays where it is", () => {
    const screen = document.createElement("div");
    const band = document.createElement("section");
    band.setAttribute("data-phone-band", "");
    const chip = document.createElement("a");
    chip.href = "#";
    band.append(chip);
    const list = scroller();
    screen.append(band, list);
    document.body.append(screen);
    const told: boolean[] = [];
    const stop = new AbortController();
    followLines(screen, (fold) => told.push(fold(false)), stop.signal);
    chip.focus();
    list.scrollTop = -1600;
    list.dispatchEvent(new Event("scroll"));
    expect(told).toEqual([]);
    chip.blur();
    list.dispatchEvent(new Event("scroll"));
    expect(told).toEqual([true]);
    stop.abort();
    screen.remove();
  });

  it("folds when the focus left in the band is no keyboard's (a tapped chip keeps it on Android)", () => {
    const screen = document.createElement("div");
    const band = document.createElement("section");
    band.setAttribute("data-phone-band", "");
    const chip = document.createElement("a");
    chip.href = "#";
    band.append(chip);
    const list = scroller();
    screen.append(band, list);
    document.body.append(screen);
    const visible = vi.spyOn(chip, "matches").mockReturnValue(false);
    const told: boolean[] = [];
    const stop = new AbortController();
    followLines(screen, (fold) => told.push(fold(false)), stop.signal);
    chip.focus();
    list.scrollTop = -1600;
    list.dispatchEvent(new Event("scroll"));
    expect(told).toEqual([true]);
    visible.mockRestore();
    stop.abort();
    screen.remove();
  });
});
