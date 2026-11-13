import { describe, expect, it } from "vitest";
import { linked } from "./linked.ts";

describe("whether a line holds a link a player can be shown for", () => {
  it("is yes for a message with one, whatever its other words", () => {
    expect(linked("watch https://youtu.be/dQw4w9WgXcQ now")).toBe(true);
  });

  // Link previews L4: a line's first https link may have a card, so the page asks the server of it as it asks of a player's.
  it("is yes for a message whose first link is an https page, a card's", () => {
    expect(linked("read https://example.com/post please")).toBe(true);
  });

  it.each(["http://example.com/post", "https://192.168.0.1/x", "https://example.com:8443/x"])(
    "is no for %j, which gets no card",
    (link) => {
      expect(linked(link)).toBe(false);
    },
  );

  it.each(["", "no link here", "see example.com", "`https://youtu.be/dQw4w9WgXcQ`"])("is no for %j", (text) => {
    expect(linked(text)).toBe(false);
  });
});
