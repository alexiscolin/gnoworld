import { describe, expect, it } from "vitest";
import { roomHref, roomLabel, shortAddress, shownRoom } from "./names.ts";

const open = (...rooms: string[]) => rooms.map((room) => ({ room, type: "open" as const }));
const SECTIONS = [
  { name: "Talk", rooms: open("#bubble/games", "#bubble") },
  { name: null, rooms: open("#bubble/news") },
];

describe("the room a world's page shows", () => {
  it.each([
    ["the room the address names", "news", "#bubble/news"],
    ["the main room when the address names none", null, "#bubble"],
    ["the main room when the address names a room not listed", "nowhere", "#bubble"],
    ["the main room when the address names it in another case", "NEWS", "#bubble"],
  ])("is %s", (_, asked, shown) => {
    expect(shownRoom("bubble", SECTIONS, asked)).toBe(shown);
  });

  it("is the first listed when the main room is not listed", () => {
    expect(shownRoom("bubble", [{ name: null, rooms: open("#bubble/games", "#bubble/news") }], "nowhere")).toBe(
      "#bubble/games",
    );
  });

  it("is none when the world lists no room", () => {
    expect(shownRoom("bubble", [], "games")).toBeUndefined();
  });
});

describe("the chat's names", () => {
  it("shortens an address to its first six and last five characters", () => {
    expect(shortAddress("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5")).toBe("g1jg8m…vsqf5");
  });

  it.each([
    ["#bubble", "#bubble", "/w/bubble"],
    ["#bubble/games", "#games", "/w/bubble?room=games"],
  ])("names %s %s, at %s", (room, label, href) => {
    expect([roomLabel(room), roomHref(room)]).toEqual([label, href]);
  });
});
