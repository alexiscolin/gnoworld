import { describe, expect, it } from "vitest";
import { titled } from "./tabTitle.ts";

const BASE = "Bubble · gno.world";

// 4f-n: the count of what the account has not seen, in the tab's title, which a tab in the background still shows.
describe("titled: a page's title with the count of what is unseen", () => {
  it("is the title itself while nothing is unseen", () => {
    expect(titled(BASE, 0)).toBe(BASE);
  });

  it("puts the count before the title", () => {
    expect(titled(BASE, 3)).toBe(`(3) ${BASE}`);
    expect(titled(BASE, 99)).toBe(`(99) ${BASE}`);
  });

  it("says 99+ past 99, as the bell's badge does", () => {
    expect(titled(BASE, 100)).toBe(`(99+) ${BASE}`);
    expect(titled(BASE, 5_000)).toBe(`(99+) ${BASE}`);
  });

  it("puts the count in place of the one it put before, never beside it", () => {
    expect(titled(`(3) ${BASE}`, 5)).toBe(`(5) ${BASE}`);
    expect(titled(`(99+) ${BASE}`, 2)).toBe(`(2) ${BASE}`);
  });

  it("takes the count off at none, and off a title that holds none", () => {
    expect(titled(`(3) ${BASE}`, 0)).toBe(BASE);
    expect(titled(`(99+) ${BASE}`, 0)).toBe(BASE);
    expect(titled(BASE, 0)).toBe(BASE);
  });

  it("leaves a title that only looks like one of its own, a year or a number in brackets", () => {
    expect(titled("(2024) Review", 0)).toBe("(2024) Review");
    expect(titled("(2024) Review", 2)).toBe("(2) (2024) Review");
    expect(titled("(3)Bubble", 0)).toBe("(3)Bubble");
    // R20: past 99 the prefix is never ours ("(99+)" stands there), nor is one with another mark.
    expect(titled("(100) Review", 0)).toBe("(100) Review");
    expect(titled("(5+) X", 0)).toBe("(5+) X");
  });

  it.each([-1, Number.NaN, 1.5, Number.POSITIVE_INFINITY])(
    "is the title itself for a count of %s, which is none",
    (count) => {
      expect(titled(BASE, count)).toBe(BASE);
    },
  );
});
