import { describe, expect, it, vi } from "vitest";
import { entered, isNewcomer, openingShown, openingShows } from "./newcomer.ts";

// A newcomer to gnoworld (ADR-0003 §4): the device keeps the first place its reader entered and whether the home's opening showed, each
// a word of its own, so neither answers for the other.
const device = () => {
  const words = new Map<string, string>();
  return {
    words,
    getItem: vi.fn((key: string) => words.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      words.set(key, value);
    }),
  };
};
const refused = () => {
  throw new DOMException("blocked", "SecurityError");
};

describe("a newcomer's memory on the device", () => {
  it("reads a device that kept nothing as a newcomer's, whose opening never showed", () => {
    const kept = device();
    expect(isNewcomer(() => kept)).toBe(true);
    expect(openingShown(() => kept)).toBe(false);
  });

  it("ends the newcomer once a place was entered, and leaves the opening's word alone", () => {
    const kept = device();
    entered(() => kept);
    expect(isNewcomer(() => kept)).toBe(false);
    expect(openingShown(() => kept)).toBe(false);
    expect(kept.words.get("gnoworld:entered")).toBe("1");
  });

  it("keeps the opening's showing apart: a reader who saw it is still new till they enter a place", () => {
    const kept = device();
    openingShows(() => kept);
    expect(openingShown(() => kept)).toBe(true);
    expect(isNewcomer(() => kept)).toBe(true);
    expect(kept.words.get("gnoworld:opened")).toBe("1");
  });

  it.each(["0", "", "true", "1 ", '{"entered":1}'])(
    "takes %j for nothing kept: a device's file is outside data",
    (held) => {
      const kept = device();
      kept.words.set("gnoworld:entered", held);
      kept.words.set("gnoworld:opened", held);
      expect(isNewcomer(() => kept)).toBe(true);
      expect(openingShown(() => kept)).toBe(false);
    },
  );

  it("reads a device whose reads fail as a newcomer's, and fails on none of its writes, when full (F4503)", () => {
    const failing = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };
    expect(isNewcomer(() => failing)).toBe(true);
    expect(openingShown(() => failing)).toBe(false);
    expect(() => {
      entered(() => failing);
      openingShows(() => failing);
    }).not.toThrow();
  });

  it("reads a device that refuses as a newcomer's, and fails on none of its writes", () => {
    expect(isNewcomer(refused)).toBe(true);
    expect(openingShown(refused)).toBe(false);
    expect(() => {
      entered(refused);
      openingShows(refused);
    }).not.toThrow();
  });
});
