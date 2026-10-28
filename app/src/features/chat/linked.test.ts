import { describe, expect, it } from "vitest";
import { linked } from "./linked.ts";

describe("whether a line holds a link a player can be shown for", () => {
  it("is yes for a message with one, whatever its other words", () => {
    expect(linked("watch https://youtu.be/dQw4w9WgXcQ now")).toBe(true);
  });

  it.each(["", "no link here", "see example.com", "`https://youtu.be/dQw4w9WgXcQ`"])("is no for %j", (text) => {
    expect(linked(text)).toBe(false);
  });
});
