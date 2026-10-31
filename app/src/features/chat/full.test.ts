import { describe, expect, it } from "vitest";
import { asksFull, withFull } from "./full.ts";
import { dmHref, dmParams, roomHref, roomParams } from "./names.ts";

// 5q's fix pass, review 1: the full chat lives in the address (?chat=full), and every link that changes the room keeps it.
describe("the full chat in the address", () => {
  it("is asked for by ?chat=full alone", () => {
    expect(asksFull(new URLSearchParams("chat=full"))).toBe(true);
    expect(asksFull(new URLSearchParams("chat=dock"))).toBe(false);
    expect(asksFull(new URLSearchParams("room=games"))).toBe(false);
  });

  it("adds and takes off the choice, keeping the rest of the search", () => {
    expect(withFull(new URLSearchParams("room=games"), true).toString()).toBe("room=games&chat=full");
    expect(withFull(new URLSearchParams("room=games&chat=full"), false).toString()).toBe("room=games");
  });

  it("keeps the choice in a room's and a conversation's address, and leaves it out otherwise", () => {
    expect(roomHref("#bubble/games")).toBe("/w/bubble?room=games");
    expect(roomHref("#bubble/games", true)).toBe("/w/bubble?room=games&chat=full");
    expect(roomHref("#bubble")).toBe("/w/bubble");
    expect(roomHref("#bubble", true)).toBe("/w/bubble?chat=full");
    expect(dmHref("bubble", "g1abc")).toBe("/w/bubble?dm=g1abc");
    expect(dmHref("bubble", "g1abc", true)).toBe("/w/bubble?dm=g1abc&chat=full");
    expect(roomParams("#bubble/games", true).toString()).toBe("room=games&chat=full");
    expect(dmParams("g1abc", true).toString()).toBe("dm=g1abc&chat=full");
  });
});
