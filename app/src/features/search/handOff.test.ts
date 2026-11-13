import { describe, expect, it } from "vitest";
import { asksHandOff, handOff } from "./handOff.ts";

// The palette's hand-off to the chat's search: the words, and the chord that hands them over.
const key = (key: string, over: object = {}) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...over,
});

describe("the palette's hand-off", () => {
  it("is an item naming the words, carrying them for the chat", () => {
    expect(handOff("  gov ")).toMatchObject({
      kind: "messages",
      find: "gov",
      name: "Search messages for “gov” in the chat",
    });
  });

  it.each(["#bubble", "@kai", "/r/gov/dao", ">earth", "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv", "a", "  "])(
    "is none for %s",
    (query) => {
      expect(handOff(query)).toBeUndefined();
    },
  );

  it("asks on ⌘⇧F and Ctrl+Shift+F alone", () => {
    expect(asksHandOff(key("f", { metaKey: true, shiftKey: true }))).toBe(true);
    expect(asksHandOff(key("F", { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(asksHandOff(key("f", { metaKey: true }))).toBe(false);
    expect(asksHandOff(key("f", { shiftKey: true }))).toBe(false);
    expect(asksHandOff(key("f", { metaKey: true, shiftKey: true, altKey: true }))).toBe(false);
  });
});
