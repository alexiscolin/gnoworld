import type { Line } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import {
  groupRooms,
  groupsAt,
  mentionable,
  neighbour,
  peopleOf,
  roomHref,
  roomLabel,
  roomParams,
  hereOf,
  talkingOf,
  roomsQuery,
  shortAddress,
  shownRoom,
} from "./names.ts";
import { rememberRealms } from "../../lib/roomRealms.ts";

const open = (...rooms: string[]) => rooms.map((room) => ({ room, type: "open" as const }));
const SECTIONS = [
  { name: "Talk", rooms: open("#bubble/games", "#bubble") },
  { name: null, rooms: open("#bubble/news") },
];

// 7f2: the Earth is a page of its own, and its main room the general chat (frames 37 to 55).
describe("a room of the Earth", () => {
  it("has its address on the Earth's page, which no /w/ path holds", () => {
    expect(roomHref("#earth")).toBe("/earth");
    expect(roomHref("#earth/lisbon")).toBe("/earth?room=lisbon");
    expect(roomHref("#earth/lisbon", true)).toBe("/earth?room=lisbon&chat=full");
  });

  it("calls its main room the general chat, and a side room by its own name", () => {
    expect(roomLabel("#earth")).toBe("#general");
    expect(roomLabel("#earth/lisbon")).toBe("#lisbon");
  });

  it("leaves a world's rooms as they were, a world that starts with the word included", () => {
    expect(roomHref("#bubble")).toBe("/w/bubble");
    expect(roomLabel("#earthworks")).toBe("#earthworks");
  });
});

describe("a realm's room, which has no page of its world", () => {
  const room = "#gnogolf-golf-e00c30567c/golf-a-0123456789";

  it("has no address until a rooms list has said its realm, then its realm's page", () => {
    expect(roomHref(room)).toBeUndefined();
    rememberRealms([{ name: null, rooms: [{ room, type: "open", realm: "gno.land/r/gnogolf/golf_a" }] }]);
    expect(roomHref(room)).toBe("/r/gnogolf/golf_a");
    expect(roomHref(room, true)).toBe("/r/gnogolf/golf_a?chat=full");
  });

  it("links to the default universe's page from another universe, never to a same path of another chain", () => {
    const here = globalThis.location;
    Object.defineProperty(globalThis, "location", { value: { pathname: "/net/onyx/earth" }, configurable: true });
    rememberRealms([{ name: null, rooms: [{ room, type: "open", realm: "gno.land/r/gnogolf/golf_c" }] }]);
    expect(roomHref(room)).toBe("/r/gnogolf/golf_c");
    Object.defineProperty(globalThis, "location", { value: here, configurable: true });
  });

  it("is a stop of Alt+Up and Alt+Down once its realm is known, and not before", () => {
    const ghost = "#gnogolf-golf-e00c30567c/golf-b-0123456789";
    const sections = ["#bubble", ghost, "#bubble/games"];
    expect(neighbour(sections, "#bubble", 1)).toBe("#bubble/games");
    rememberRealms([{ name: null, rooms: [{ room: ghost, type: "open", realm: "gno.land/r/gnogolf/golf_b" }] }]);
    expect(neighbour(sections, "#bubble", 1)).toBe(ghost);
  });

  it("stays unlinked when it has neither a page nor a realm", () => {
    expect(roomHref("#nowhere/x-0123456789")).toBeUndefined();
  });
});

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

// F819: whom a mention may shorten: the members, and the authors in view by their account tag.
describe("whom a mention may shorten", () => {
  const A = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
  const B = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
  const line = (over: Partial<Line>): Line => ({
    id: "x",
    time: "2026-10-25T10:00:00.000Z",
    from: "n",
    text: "t",
    kind: "message",
    ...over,
  });

  it("are the members and the lines' account authors, each once", () => {
    expect(
      [...mentionable([A], [line({ account: B }), line({ account: B }), line({ account: A })])].toSorted(),
    ).toEqual([A, B].toSorted());
  });

  it("leaves out a line with no account tag, though its sender is an address", () => {
    expect([...mentionable([A], [line({ from: B })])]).toEqual([A]);
  });

  it("is empty with no member and no line", () => {
    expect(mentionable([], []).size).toBe(0);
  });
});

// D374: "talking now" is who wrote in the last 15 minutes, from the lines the room holds; "here now" is who has it open.
describe("talkingOf", () => {
  const A = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
  const B = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
  const NOW = Date.parse("2026-11-07T10:30:00.000Z");
  const said = (from: string, minutesAgo: number, account?: string) => ({
    from,
    time: new Date(NOW - minutesAgo * 60_000).toISOString(),
    ...(account === undefined ? {} : { account }),
  });

  it("counts each person who wrote in the last 15 minutes once, the bot left out", () => {
    const lines = [said(A, 1, A), said(A, 2, A), said(B, 14, B), said("gnoworld", 1), said("old", 16, "g1old")];
    expect(talkingOf(lines, NOW, true)).toBe(2);
  });

  it("counts a guest by nick, apart from an account of the same nick", () => {
    expect(talkingOf([said("ines", 1), said("ines", 2, "g1ines")], NOW, true)).toBe(2);
  });

  it("says none before the connection, and none talking in a room with no line", () => {
    expect(talkingOf([said(A, 1, A)], NOW, false)).toBeUndefined();
    expect(talkingOf([], NOW, true)).toBe(0);
  });
});

describe("hereOf", () => {
  it("counts the members, the moderation bot left out, once connected", () => {
    expect(hereOf(["gnoworld", "a", "b"], true)).toBe(2);
    expect(hereOf(["a"], false)).toBeUndefined();
    expect(hereOf(undefined, true)).toBeUndefined();
  });
});

describe("a room of a realm's world", () => {
  // Bug: a generated world (gnoradio's) has no /w/ page, so its rooms led to "No world here".
  const ghost = "#nym-alexiscolin000-gnoradio-0123456789/home-0123456789";

  it("has no address: the Earth's and a hub's rooms keep theirs", () => {
    expect(roomHref(ghost)).toBeUndefined();
    expect(roomHref("#nym-alexiscolin000-gnoradio-0123456789")).toBeUndefined();
    expect(roomHref("#bubble/games")).toBe("/w/bubble?room=games");
    expect(roomHref("#earth/lisbon")).toBe("/earth?room=lisbon");
  });

  it("is skipped by Alt+Up and Alt+Down: the next room is the next with a page", () => {
    const rooms = ["#bubble", ghost, "#bubble/news"];
    expect(neighbour(rooms, "#bubble", 1)).toBe("#bubble/news");
    expect(neighbour(rooms, "#bubble/news", -1)).toBe("#bubble");
    // A ghost room one is in is still in the list: the keys leave it, and come back to it.
    expect(neighbour(rooms, ghost, 1)).toBe("#bubble/news");
    expect(neighbour(rooms, ghost, -1)).toBe("#bubble");
  });
});
