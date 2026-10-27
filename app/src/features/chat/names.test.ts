import { Address } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import {
  groupRooms,
  groupsAt,
  neighbour,
  peopleOf,
  roomHref,
  roomLabel,
  roomParams,
  roomsQuery,
  shortAddress,
  shownRoom,
} from "./names.ts";

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

// The list depends on who reads it: asked once the session is known, so a page whose chat loads before its /me
// answers asks it once (4b's pre-merge).
describe("what a world's room list is asked for", () => {
  const ADDRESS = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");

  it("is nothing while the session is unknown", () => {
    expect(roomsQuery("bubble", { kind: "unknown" }, 0)).toBeUndefined();
  });

  it("names the world, who reads and the try", () => {
    const guest = roomsQuery("bubble", { kind: "out" }, 0);
    const account = roomsQuery("bubble", { kind: "in", address: ADDRESS }, 0);
    expect(
      new Set([guest, account, roomsQuery("bubble", { kind: "out" }, 1), roomsQuery("earth", { kind: "out" }, 0)]).size,
    ).toBe(4);
    expect(roomsQuery("bubble", { kind: "out" }, 0)).toBe(guest);
  });

  it("differs from one account to another: a reader's rooms are its own", () => {
    const other = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
    expect(roomsQuery("bubble", { kind: "in", address: ADDRESS }, 0)).not.toBe(
      roomsQuery("bubble", { kind: "in", address: other }, 0),
    );
  });
});

describe("the room Alt+Up and Alt+Down go to", () => {
  const ROOMS = ["#bubble/games", "#bubble", "#bubble/news"];
  it.each([
    ["#bubble/games", 1, "#bubble"],
    ["#bubble", 1, "#bubble/news"],
    ["#bubble", -1, "#bubble/games"],
    ["#bubble/news", 1, undefined],
    ["#bubble/games", -1, undefined],
    ["#elsewhere", 1, undefined],
  ] as const)("from %s, a step of %d, is %s: the list's ends stop it", (from, step, to) => {
    expect(neighbour(ROOMS, from, step)).toBe(to);
  });
});

describe("the people a mention completes to", () => {
  const SELF = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
  const OTHER = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
  it("are the room's other accounts, each once: not oneself, a guest's nick or the bot", () => {
    expect(peopleOf([SELF, "guest-abcdef", OTHER, "gnoworld", OTHER], SELF)).toStrictEqual([OTHER]);
  });
});

describe("a room's search on its world's page", () => {
  it("names a room by ?room=<name>, and the main room by none", () => {
    expect(roomParams("#bubble/games").toString()).toBe("room=games");
    expect(roomParams("#bubble").toString()).toBe("");
  });
});

// 4f-n: a mention of the whole room counts where Ergo's own modes limit who speaks (an announcement room) or who reads
// (a room of members): the page has no list of a world's moderators, so an open room's @room is a stranger's.
describe("groupRooms: where a mention of the whole room counts", () => {
  const typed = (room: string, type: "open" | "announcement" | "accounts" | "members" | "members-write") => ({
    room,
    type,
  });

  it("lists the announcement, members and members-write rooms, in the order the world lists them, and no other", () => {
    const sections = [
      {
        name: "Talk",
        rooms: [typed("#a/open", "open"), typed("#a/news", "announcement"), typed("#a/who", "accounts")],
      },
      { name: null, rooms: [typed("#a/crew", "members"), typed("#a/core", "members-write")] },
    ];
    expect(groupRooms(sections)).toEqual(["#a/news", "#a/crew", "#a/core"]);
  });

  it("lists none for a world of open rooms, or of none", () => {
    expect(groupRooms([{ name: null, rooms: [typed("#a", "open"), typed("#a/b", "accounts")] }])).toEqual([]);
    expect(groupRooms([])).toEqual([]);
  });
});

describe("groupsAt: whether a mention of the whole room counts in a room", () => {
  const sections = [
    {
      name: null,
      rooms: [
        { room: "#a", type: "open" as const },
        { room: "#a/news", type: "announcement" as const },
      ],
    },
  ];

  it("is true for a room that is listed so, false for another, and for none", () => {
    expect(groupsAt(sections, "#a/news")).toBe(true);
    expect(groupsAt(sections, "#a")).toBe(false);
    expect(groupsAt(sections, undefined)).toBe(false);
  });
});
