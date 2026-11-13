import { describe, expect, it, vi } from "vitest";
import { entered, isNewcomer } from "./newcomer.ts";

// A newcomer to gnoworld (ADR-0003 §4): the device keeps the first place its reader entered.
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
  it("reads a device that kept nothing as a newcomer's", () => {
    const kept = device();
    expect(isNewcomer(() => kept)).toBe(true);
  });

  it("ends the newcomer once a place was entered", () => {
    const kept = device();
    entered(() => kept);
    expect(isNewcomer(() => kept)).toBe(false);
    expect(kept.words.get("gnoworld:entered")).toBe("1");
  });

  it.each(["0", "", "true", "1 ", '{"entered":1}'])(
    "takes %j for nothing kept: a device's file is outside data",
    (held) => {
      const kept = device();
      kept.words.set("gnoworld:entered", held);
      expect(isNewcomer(() => kept)).toBe(true);
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
    expect(() => {
      entered(() => failing);
    }).not.toThrow();
  });

  it("reads a device that refuses as a newcomer's, and fails on none of its writes", () => {
    expect(isNewcomer(refused)).toBe(true);
    expect(() => {
      entered(refused);
    }).not.toThrow();
  });
});
