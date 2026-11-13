import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "@gnoworld/service/db";
import { migrations } from "../migrations.ts";
import type { Rules } from "../roles/roles.ts";
import { ensureNamed, roomWorld } from "../rooms/rooms.ts";
import type { Typed } from "../rooms/types.ts";
import { guestAccess } from "./access.ts";

const RULES: Rules = { bannedWords: [], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

// The Earth with a typed room of each kind, a realm's room made ahead (D413) and an Earth player room (D394), which no file types.
const ROLES: Typed = {
  worlds: new Map([
    [
      "earth",
      {
        rules: RULES,
        groups: new Map([["crew", new Set<string>()]]),
        rooms: new Map([
          ["#earth/news", { type: "announcement" as const, hidden: false }],
          ["#earth/crew", { type: "members" as const, readers: "crew", hidden: false }],
          ["#earth/ops", { type: "members-write" as const, readers: "crew", writers: "crew", hidden: false }],
          ["#earth/accounts", { type: "accounts" as const, hidden: false }],
          ["#earth/secret", { type: "open" as const, hidden: true }],
          ["#earth/hidden-news", { type: "announcement" as const, hidden: true }],
          ["#earth/lounge", { type: "open" as const, hidden: false }],
        ]),
      },
    ],
  ]),
};
const ROOMS = [
  ...["#earth", "#earth/news", "#earth/crew", "#earth/ops", "#earth/accounts", "#earth/secret", "#earth/hidden-news"],
  ...["#earth/lounge", "#earth/kyoto", "#earth/old", "#gnoswap/pool-0123456789"],
];

const setup = (archived: readonly string[] = ["#earth/old"]) => {
  const db = openDatabase(":memory:", migrations);
  opened.push(db);
  ensureNamed(
    db,
    ROOMS.map((name) => ({ name, world: name.slice(1).split("/")[0] ?? "" })),
    0,
  );
  const access = guestAccess(ROLES, (room) => archived.includes(room));
  // The route reads the room's world once, from the table, and hands it over: none for a room the server never made.
  return (room: string) => access(room, roomWorld(db, room));
};

describe("where a guest may speak: the server is the only gate (D430)", () => {
  it("writes in an open room, the Earth's main room, a typed open one, a realm's room made ahead, and an Earth player room", () => {
    const access = setup();
    expect(["#earth", "#earth/lounge", "#gnoswap/pool-0123456789", "#earth/kyoto"].map(access)).toEqual([
      "write",
      "write",
      "write",
      "write",
    ]);
  });

  it("reads an announcement room, and writes nowhere that only staff or voices speak", () => {
    expect(setup()("#earth/news")).toBe("read");
  });

  it("has nothing for a members room (+i), a members-write room, an accounts room, a hidden room, an archived room", () => {
    const access = setup();
    expect(
      ["#earth/crew", "#earth/ops", "#earth/accounts", "#earth/secret", "#earth/hidden-news", "#earth/old"].map(access),
    ).toEqual(Array(6).fill(undefined));
  });

  it("has nothing for a room the server never made, a case variant of one it made, or a name no room has", () => {
    const access = setup();
    expect(
      ["#nowhere", "#EARTH", "#Earth/kyoto", "#earth/KYOTO", "earth", "", "#earth ", "#earth/news/x"].map(access),
    ).toEqual(Array(8).fill(undefined));
  });

  it("follows the keeper's archive: an Earth player room archived is nothing, live again it is written in", () => {
    expect(setup(["#earth/kyoto"])("#earth/kyoto")).toBeUndefined();
    expect(setup([])("#earth/kyoto")).toBe("write");
  });

  it("gives a room of a world the roles file does not list the open type, as the room list does: written in", () => {
    const access = setup();
    expect(access("#gnoswap/pool-0123456789")).toBe("write");
  });
});
