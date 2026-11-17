// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { opensChatSearch } from "./searchKeys.ts";

// The chat's search chords: ⌘ or Ctrl with Shift and F; the slash only in the full chat and outside a field; ⌘F alone is the browser's.
const key = (key: string, over: Partial<Parameters<typeof opensChatSearch>[0]> = {}) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...over,
});

describe("the chords of the chat's search", () => {
  it("opens on ⌘⇧F and Ctrl+Shift+F, either case of the letter", () => {
    expect(opensChatSearch(key("f", { metaKey: true, shiftKey: true }), false)).toBe(true);
    expect(opensChatSearch(key("F", { ctrlKey: true, shiftKey: true }), false)).toBe(true);
  });

  it("leaves ⌘F, a bare F, Shift+F and Alt+⌘⇧F alone", () => {
    expect(opensChatSearch(key("f", { metaKey: true }), true)).toBe(false);
    expect(opensChatSearch(key("f"), true)).toBe(false);
    expect(opensChatSearch(key("F", { shiftKey: true }), true)).toBe(false);
    expect(opensChatSearch(key("f", { metaKey: true, shiftKey: true, altKey: true }), true)).toBe(false);
  });

  it("opens on a bare slash in the full chat, never in a docked one", () => {
    expect(opensChatSearch(key("/"), true)).toBe(true);
    expect(opensChatSearch(key("/"), false)).toBe(false);
  });

  it("leaves a slash with a modifier, and a slash typed in a field", () => {
    expect(opensChatSearch(key("/", { ctrlKey: true }), true)).toBe(false);
    expect(opensChatSearch(key("/", { metaKey: true }), true)).toBe(false);
    expect(opensChatSearch(key("/", { altKey: true }), true)).toBe(false);
    const field = document.createElement("input");
    expect(opensChatSearch(key("/", { target: field }), true)).toBe(false);
    expect(opensChatSearch(key("/", { target: document.createElement("div") }), true)).toBe(true);
  });
});
