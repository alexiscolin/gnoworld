import { describe, expect, it } from "vitest";
import { CreateRoom, MadeRoom, RoomId, RoomList, RoomName } from "./rooms.ts";

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

// A room as the server and Ergo name it: #<world> for a world's main room, #<world>/<name> for a moderator's.
describe("a room's id", () => {
  it.each([
    "#ab",
    "#bubble",
    "#bubble/garden",
    "#earth/r2-d2",
    `#${"a".repeat(63)}`,
    `#${"a".repeat(30)}/${"b".repeat(32)}`,
  ])("takes %j", (room) => {
    expect(RoomId.parse(room)).toBe(room);
  });

  it.each([
    ["no #", "bubble"],
    ["a # alone", "#"],
    ["one letter, under 2 characters in all", "#"],
    ["65 characters", `#${"a".repeat(64)}`],
    ["two slashes", "#a/b/c"],
    ["an empty name after the slash", "#bubble/"],
    ["a capital", "#Bubble"],
    ["a space", "#bubble garden"],
    ["a comma", "#a,b"],
    ["a CR", "#a\rb"],
    ["two hyphens", "#a--b"],
    ["an accent", "#café"],
  ])("refuses %s", (_, room) => {
    expect(RoomId.safeParse(room).success).toBe(false);
  });
});

// F671: the room the server made, read by its client as a room's id.
describe("a room made", () => {
  it("is the room's id", () => {
    expect(MadeRoom.parse({ room: "#bubble/garden" })).toEqual({ room: "#bubble/garden" });
  });

  it.each(["", "#", "bubble", `#${"a".repeat(64)}`])("refuses %j", (room) => {
    expect(MadeRoom.safeParse({ room }).success).toBe(false);
  });
});

// A world's rooms as a reader may see them (Alexis, 2026-10-25): in its moderators' sections, then the rest.
describe("a world's rooms", () => {
  const LIST = {
    world: "bubble",
    sections: [
      { name: "General", rooms: [{ room: "#bubble", type: "open" }] },
      { name: null, rooms: [{ room: "#bubble/garden", type: "announcement" }] },
    ],
  };

  it("takes each section, named or not, with its rooms and their types", () => {
    expect(RoomList.parse(LIST)).toEqual(LIST);
  });

  // The roles file names 50 sections at most (server/src/roles/roles.ts), and the server adds the others.
  it("takes 51 sections, the file's 50 and the others, and 500 rooms in a section", () => {
    const rooms = Array.from({ length: 500 }, () => ({ room: "#bubble", type: "open" as const }));
    const sections = [
      ...Array.from({ length: 50 }, (_, n) => ({ name: `s${String(n)}`, rooms: [] })),
      { name: null, rooms },
    ];
    expect(RoomList.safeParse({ world: "bubble", sections }).success).toBe(true);
  });

  it.each(["open", "announcement", "accounts", "members", "members-write"])("takes a room of type %s", (type) => {
    expect(
      RoomList.parse({ world: "bubble", sections: [{ name: null, rooms: [{ room: "#bubble", type }] }] }),
    ).toBeDefined();
  });

  it.each([
    ["an unknown type", { world: "bubble", sections: [{ name: null, rooms: [{ room: "#bubble", type: "secret" }] }] }],
    [
      "a room that is no id",
      { world: "bubble", sections: [{ name: null, rooms: [{ room: "bubble", type: "open" }] }] },
    ],
    ["an empty section name", { world: "bubble", sections: [{ name: "", rooms: [] }] }],
    ["a section name past 64", { world: "bubble", sections: [{ name: "s".repeat(65), rooms: [] }] }],
    ["a world that is no slug", { world: "Bubble", sections: [] }],
    ["52 sections", { world: "bubble", sections: Array.from({ length: 52 }, () => ({ name: null, rooms: [] })) }],
    [
      "501 rooms in a section",
      {
        world: "bubble",
        sections: [{ name: null, rooms: Array.from({ length: 501 }, () => ({ room: "#bubble", type: "open" })) }],
      },
    ],
  ])("refuses %s", (_, list) => {
    expect(RoomList.safeParse(list).success).toBe(false);
  });
});
