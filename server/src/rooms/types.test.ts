import { Address, toAddress } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import type { Roles } from "../roles/roles.ts";
import { desired, listed, mayRead, openRoom, publicRoom, roomType } from "./types.ts";

const TEAM = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const MOD = Address.parse("g1zgldsmn6ck6w4p325xd3j8y779ky6fpjnz3uh9");
const READER = Address.parse("g1m68zzc430znqyxzv6jsfz45hgccacx3mk6qajw");
const WRITER = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const STRANGER = Address.parse("g1uauvt7txunf9zeu2qyrzv0pa5uvwjlq90r3qpa");
const OTHER_MOD = Address.parse(toAddress(new Uint8Array(20).fill(42)));
const RULES = { bannedWords: [], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
const ROLES: Roles = {
  team: new Set([TEAM]),
  trusted: new Set(),
  worlds: new Map([
    [
      "earth",
      {
        moderators: new Set([MOD]),
        rules: RULES,
        groups: new Map([
          ["readers", new Set([READER])],
          ["writers", new Set([WRITER])],
        ]),
        rooms: new Map([
          ["#earth", { type: "open" as const, hidden: false }],
          ["#earth/news", { type: "announcement" as const, hidden: false }],
          ["#earth/door", { type: "accounts" as const, hidden: true }],
          ["#earth/crew", { type: "members" as const, readers: "readers", hidden: false }],
          ["#earth/desk", { type: "members-write" as const, readers: "readers", writers: "writers", hidden: false }],
          ["#earth/vault", { type: "members" as const, readers: "readers", hidden: true }],
        ]),
      },
    ],
    ["bubble", { moderators: new Set([OTHER_MOD]), rules: RULES, groups: new Map(), rooms: new Map() }],
  ]),
};

describe("a room's type in Ergo", () => {
  it.each([
    ["#earth", { modes: "M", invites: [], voiced: [] }],
    ["#earth/unlisted-in-the-file", { modes: "M", invites: [], voiced: [] }],
    ["#earth/news", { modes: "Mm", invites: [], voiced: [TEAM, MOD].toSorted() }],
    ["#earth/door", { modes: "MRs", invites: [], voiced: [] }],
    ["#earth/crew", { modes: "Mi", invites: [TEAM, MOD, READER].toSorted(), voiced: [] }],
    [
      "#earth/desk",
      { modes: "Mim", invites: [TEAM, MOD, READER, WRITER].toSorted(), voiced: [TEAM, MOD, WRITER].toSorted() },
    ],
  ])("makes %s what its type says", (room, state) => {
    expect(desired(ROLES, room, { archived: false })).toEqual(state);
  });

  it("makes an archived room read-only and unlisted, whatever its type, voicing nobody", () => {
    expect(desired(ROLES, "#earth/news", { archived: true })).toEqual({
      modes: "Mms",
      invites: [],
      voiced: [],
    });
    expect(desired(ROLES, "#earth/crew", { archived: true })).toEqual({
      modes: "Mims",
      invites: [TEAM, MOD, READER].toSorted(),
      voiced: [],
    });
  });

  it("makes an archived hidden room read-only and unlisted with each letter once", () => {
    expect(desired(ROLES, "#earth/vault", { archived: true }).modes).toBe("Mims");
  });

  it("makes a room of a world the file no longer names open", () => {
    expect(desired(ROLES, "#gone", { archived: false })).toEqual({ modes: "M", invites: [], voiced: [] });
  });
});

describe("who reads a room", () => {
  // The team, the world's moderator, a reader, a writer, a stranger, another world's moderator, a guest.
  const everyone = [TEAM, MOD, READER, WRITER, STRANGER, OTHER_MOD, undefined];
  it.each([
    ["#earth", [true, true, true, true, true, true, true]],
    ["#earth/news", [true, true, true, true, true, true, true]],
    ["#earth/door", [true, true, true, true, true, true, false]],
    ["#earth/crew", [true, true, true, false, false, false, false]],
    ["#earth/desk", [true, true, true, true, false, false, false]],
  ])(
    "reads %s: the team, its moderator, a reader, a writer, a stranger, another world's moderator, a guest",
    (room, answers) => {
      expect(everyone.map((who) => mayRead(ROLES, room, who))).toEqual(answers);
    },
  );

  it("sends a public room's lines to OpenAI, never a members room's", () => {
    expect(
      ["#earth", "#earth/news", "#earth/door", "#earth/crew", "#earth/desk"].map((room) => publicRoom(ROLES, room)),
    ).toEqual([true, true, true, false, false]);
  });
});

// Slice 9h, D214: a world's first words are served to anyone with their author's address, so only a line of a room open to
// all to read and write, and listed, can be them.
describe("the rooms whose lines may be a world's first words", () => {
  it("are the open and listed ones: no announcement, accounts, members or hidden room, and a room the file does not type is open", () => {
    const hidden: Roles = {
      ...ROLES,
      worlds: new Map([
        [
          "mint",
          {
            moderators: new Set<Address>(),
            rules: RULES,
            rooms: new Map([["#mint/back", { type: "open" as const, hidden: true }]]),
          },
        ],
      ]),
    };
    expect(
      ["#earth", "#earth/news", "#earth/door", "#earth/crew", "#earth/desk", "#earth/vault", "#bubble/games"].map(
        (room) => openRoom(ROLES, room),
      ),
    ).toEqual([true, false, false, false, false, false, true]);
    expect([openRoom(hidden, "#mint/back"), openRoom(hidden, "#mint")]).toEqual([false, true]);
  });
});

describe("who sees a room listed (3m)", () => {
  it("lists a hidden room to its world's moderators and the team alone, a members one to whom may read it", () => {
    const sees = (room: string) =>
      [TEAM, MOD, READER, WRITER, STRANGER, OTHER_MOD, undefined].map((who) => listed(ROLES, room, who));
    expect(sees("#earth/door")).toEqual([true, true, false, false, false, false, false]);
    expect(sees("#earth/vault")).toEqual([true, true, false, false, false, false, false]);
    expect(sees("#earth/crew")).toEqual([true, true, true, false, false, false, false]);
    expect(sees("#earth")).toEqual([true, true, true, true, true, true, true]);
  });
});

describe("a room's type (4b)", () => {
  it.each([
    ["#earth/news", "announcement"],
    ["#earth/door", "accounts"],
    ["#earth/crew", "members"],
    ["#earth/desk", "members-write"],
    ["#earth/vault", "members"],
    // Typed in the file as open, or not in it, or of a world the file does not name: open.
    ["#earth", "open"],
    ["#earth/unlisted-in-the-file", "open"],
    ["#bubble", "open"],
    ["#gone", "open"],
    ["#gone/room", "open"],
  ])("types %s as %s", (room, type) => {
    expect(roomType(ROLES, room)).toBe(type);
  });
});

describe("a realm's room, which no file types", () => {
  const room = "#bubble/golf-0123456789";
  it("is open to every account and guest, and its world's moderators and the team are no more than anyone in it", () => {
    expect(desired(ROLES, room, { archived: false })).toEqual({ modes: "M", invites: [], voiced: [] });
    expect([mayRead(ROLES, room, undefined), listed(ROLES, room, undefined), openRoom(ROLES, room)]).toEqual([
      true,
      true,
      true,
    ]);
  });
});
