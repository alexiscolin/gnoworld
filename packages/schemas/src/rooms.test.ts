import { describe, expect, it } from "vitest";
import { CreateRoom, RoomName } from "./rooms.ts";

describe("a room's name", () => {
  it.each([["a"], ["garden"], ["a-b"], ["r2-d2"], ["a".repeat(32)]])("takes %j", (name) => {
    expect(RoomName.parse(name)).toBe(name);
  });

  it.each([
    ["33 characters", "a".repeat(33)],
    ["an empty name", ""],
    ["a capital", "Garden"],
    ["two hyphens", "a--b"],
    ["a hyphen first", "-a"],
    ["a hyphen last", "a-"],
    ["a space", "a b"],
    ["a slash", "a/b"],
    ["a CR", "a\rb"],
    ["a LF", "a\nb"],
    ["a NUL", "a\u0000b"],
    ["a comma", "a,b"],
    ["a #", "#a"],
    ["an accent", "café"],
  ])("refuses %s", (_, name) => {
    expect(RoomName.safeParse(name).success).toBe(false);
  });
});

describe("a room to make", () => {
  it("is a world's slug and a room's name, and nothing more", () => {
    expect(CreateRoom.parse({ world: "bubble", name: "garden" })).toEqual({ world: "bubble", name: "garden" });
    for (const bad of [
      { world: "bubble" },
      { world: "Bubble", name: "garden" },
      { world: "bubble", name: "garden", type: "members" },
      { world: "bubble/x", name: "garden" },
    ]) {
      expect(CreateRoom.safeParse(bad).success).toBe(false);
    }
  });
});
