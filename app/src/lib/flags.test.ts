import { describe, expect, it } from "vitest";
import { readFlag, writeFlag } from "./flags.ts";

// What the device keeps for the site: a word by key, and nothing where it refuses.
const kept = () => {
  const words = new Map<string, string>();
  return {
    getItem: (key: string) => words.get(key) ?? null,
    setItem: (key: string, value: string) => {
      words.set(key, value);
    },
  };
};
const refusing = {
  getItem: (): string | null => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("full");
  },
};

describe("a device's kept words", () => {
  it("gives back what it kept, by its key, and nothing for another", () => {
    const storage = kept();
    writeFlag("gnoworld:visited:onyx:bubble", "1", () => storage);
    expect(readFlag("gnoworld:visited:onyx:bubble", () => storage)).toBe("1");
    expect(readFlag("gnoworld:visited:onyx:other", () => storage)).toBeNull();
  });

  it("keeps nothing and throws nothing where the device refuses", () => {
    expect(() => {
      writeFlag("k", "1", () => refusing);
    }).not.toThrow();
    expect(readFlag("k", () => refusing)).toBeNull();
  });
});
