import { describe, expect, it } from "vitest";
import { countWords, unreadOf } from "./unread.ts";

describe("unreadOf", () => {
  it("adds every room's and conversation's count, not the number of rooms that hold some", () => {
    expect(unreadOf({ "#bubble": 2, "#games": 1, g1abc: 4 })).toBe(7);
  });
  it("is none without badges, and ignores a count under 1", () => {
    expect(unreadOf(undefined)).toBe(0);
    expect(unreadOf({ "#bubble": 0, "#games": -3 })).toBe(0);
  });
});

describe("countWords", () => {
  it("says the number up to 99 and 99+ past it", () => {
    expect(countWords(1)).toBe("1");
    expect(countWords(99)).toBe("99");
    expect(countWords(100)).toBe("99+");
  });
});
