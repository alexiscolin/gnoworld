import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { openDatabase } from "@gnoworld/service/db";
import {
  EARTH_PER_DAY,
  EARTH_ROOMS_MAX,
  EARTH_ROWS_MAX,
  EARTH_TABLES,
  makeRooms,
  REALM_PATH,
  REALM_TABLES,
  ROOM_STATE,
} from "./create.ts";
import { ensureRooms, listRooms, realmPaths, ROOM_TABLES } from "./rooms.ts";

const T0 = Date.parse("2026-10-22T12:00:00.000Z");
const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

const setup = ({
  max = 20,
  earthMax,
  earthRowsMax,
}: { max?: number; earthMax?: number; earthRowsMax?: number } = {}) => {
  const db = openDatabase(":memory:", [ROOM_TABLES, ROOM_STATE, REALM_TABLES, REALM_PATH, EARTH_TABLES]);
  opened.push(db);
  ensureRooms(db, ["bubble", "earth"], T0);
  const link = { up: true };
  const clock = { now: T0 };
  const sent: string[] = [];
  const rooms = makeRooms({
    db,
    send: (command, params) => {
      if (!link.up) return false;
      sent.push([command, ...params].join(" "));
      return true;
    },
    now: () => clock.now,
    max,
    ...(earthMax === undefined ? {} : { earthMax }),
    ...(earthRowsMax === undefined ? {} : { earthRowsMax }),
  });
  const archived = () =>
    z
      .array(z.object({ name: z.string(), archived: z.number() }))
      .parse(db.prepare("SELECT name, archived FROM rooms ORDER BY name").all());
  return { db, link, sent, rooms, archived, clock };
};

describe("a moderator's room", () => {
  it("is made as #world/name: recorded in its world, joined, open to accounts (+M) and to all (-i)", () => {
    const { db, sent, rooms } = setup();
    expect(rooms.create("bubble", "garden")).toEqual({ made: "#bubble/garden" });
    expect(listRooms(db)).toContainEqual({ name: "#bubble/garden", world: "bubble" });
    expect(sent).toEqual(["JOIN #bubble/garden", "SAMODE #bubble/garden +M", "SAMODE #bubble/garden -i"]);
  });

  it("is made once: a name its world has already is refused", () => {
    const { sent, rooms } = setup();
    expect([rooms.create("bubble", "garden"), rooms.create("bubble", "garden")]).toEqual([
      { made: "#bubble/garden" },
      "exists",
    ]);
    expect(rooms.create("earth", "garden")).toEqual({ made: "#earth/garden" });
    expect(sent.filter((line) => line.startsWith("JOIN"))).toEqual(["JOIN #bubble/garden", "JOIN #earth/garden"]);
  });

  it("holds a world to its cap, its main room aside, each world apart", () => {
    const { rooms } = setup({ max: 2 });
    expect([rooms.create("bubble", "a"), rooms.create("bubble", "b"), rooms.create("bubble", "c")]).toEqual([
      { made: "#bubble/a" },
      { made: "#bubble/b" },
      "full",
    ]);
    expect(rooms.create("earth", "a")).toEqual({ made: "#earth/a" });
  });

  it("is recorded while the link is down; the reconciler sets it when the link is back (3m)", () => {
    const { db, link, sent, rooms } = setup();
    link.up = false;
    expect(rooms.create("bubble", "garden")).toEqual({ made: "#bubble/garden" });
    expect([listRooms(db).map(({ name }) => name), sent]).toEqual([["#bubble", "#bubble/garden", "#earth"], []]);
  });

  it("is archived, never destroyed: read-only (+m) and unlisted (+s), kept in its world", () => {
    const { sent, rooms, archived } = setup();
    rooms.create("bubble", "garden");
    expect(rooms.archive("bubble", "garden")).toBe("archived");
    expect(sent.slice(3)).toEqual(["SAMODE #bubble/garden +m", "SAMODE #bubble/garden +s"]);
    expect(archived()).toContainEqual({ name: "#bubble/garden", archived: 1 });
    expect(rooms.archive("bubble", "garden")).toBe("archived");
    expect(sent).toHaveLength(5);
  });

  it("keeps an archived room's name and its place in the world's cap: no spam by making and archiving", () => {
    const { rooms } = setup({ max: 2 });
    rooms.create("bubble", "a");
    rooms.create("bubble", "b");
    rooms.archive("bubble", "a");
    expect([rooms.create("bubble", "c"), rooms.create("bubble", "a")]).toEqual(["full", "exists"]);
  });

  it("makes no room whose channel would pass Ergo's 64 characters, and one of 64 exactly", () => {
    const { db, sent, rooms } = setup();
    // "#" + a world of 31 + "/" leaves 31 for the name.
    const world = "w".repeat(31);
    expect(rooms.create(world, "a".repeat(32))).toBe("too_long");
    expect(listRooms(db).filter(({ world: w }) => w === world)).toEqual([]);
    expect(sent).toEqual([]);
    const made = rooms.create(world, "a".repeat(31));
    expect(made).toEqual({ made: `#${world}/${"a".repeat(31)}` });
    expect(typeof made === "object" ? made.made.length : 0).toBe(64);
  });

  it("adds the archived column to a file made before it, each room kept open", () => {
    const folder = mkdtempSync(join(tmpdir(), "gnoworld-rooms-"));
    try {
      const file = join(folder, "gnoworld.sqlite");
      const before = openDatabase(file, [ROOM_TABLES]);
      ensureRooms(before, ["earth"], T0);
      before.close();
      for (let n = 0; n < 2; n += 1) {
        const db = openDatabase(file, [ROOM_TABLES, ROOM_STATE, REALM_TABLES, REALM_PATH, EARTH_TABLES]);
        try {
          expect(db.prepare("SELECT name, archived FROM rooms").all()).toEqual([{ name: "#earth", archived: 0 }]);
        } finally {
          db.close();
        }
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("archives no room it never made, another world's included", () => {
    const { rooms } = setup();
    rooms.create("earth", "garden");
    expect([rooms.archive("bubble", "nowhere"), rooms.archive("bubble", "garden")]).toEqual(["not_found", "not_found"]);
  });
});

describe("a realm's room's path", () => {
  const OLD = [ROOM_TABLES, ROOM_STATE, REALM_TABLES, EARTH_TABLES];

  it("is added to a database made before it, its old rooms kept with none", () => {
    const file = join(mkdtempSync(join(tmpdir(), "rooms-")), "old.db");
    const old = openDatabase(file, OLD);
    ensureRooms(old, ["bubble"], T0);
    old.prepare("INSERT INTO rooms (name, world, created_at) VALUES ('#leon', 'leon', 1)").run();
    old.prepare("INSERT INTO realm_rooms (name) VALUES ('#leon')").run();
    old.close();
    const db = openDatabase(file, [...OLD, REALM_PATH]);
    opened.push(db);
    expect(realmPaths(db, "leon")).toEqual(new Map());
    const rooms = makeRooms({ db, send: () => true, now: () => T0, max: 20 });
    rooms.tagRealm("#leon", "gno.land/r/leon/home");
    expect(realmPaths(db, "leon")).toEqual(new Map([["#leon", "gno.land/r/leon/home"]]));
  });

  it("is kept when the room is made, and tagged once: a room's path never changes", () => {
    const { db, rooms } = setup();
    rooms.realm("#bubble/golf-0123456789", 0, "gno.land/r/bubble/golf");
    rooms.tagRealm("#bubble/golf-0123456789", "gno.land/r/other/golf");
    rooms.tagRealm("#bubble", "gno.land/r/x/y");
    expect(realmPaths(db, "bubble")).toEqual(new Map([["#bubble/golf-0123456789", "gno.land/r/bubble/golf"]]));
  });
});

describe("a realm's room", () => {
  const realmSetup = (more: { max?: number; realmMax?: number } = {}) => {
    const db = openDatabase(":memory:", [ROOM_TABLES, ROOM_STATE, REALM_TABLES, REALM_PATH, EARTH_TABLES]);
    opened.push(db);
    ensureRooms(db, ["bubble"], T0);
    const sent: string[] = [];
    const rooms = makeRooms({
      db,
      send: (command, params) => sent.push([command, ...params].join(" ")) > 0,
      now: () => T0,
      max: more.max ?? 20,
      ...(more.realmMax === undefined ? {} : { realmMax: more.realmMax }),
    });
    return { db, sent, rooms };
  };

  it("is made as the room it is named: recorded in its world, joined, open to accounts (+M) and to all (-i)", () => {
    const { db, sent, rooms } = realmSetup();
    expect(rooms.realm("#bubble/golf-0123456789")).toEqual({ made: "#bubble/golf-0123456789" });
    expect(listRooms(db)).toContainEqual({ name: "#bubble/golf-0123456789", world: "bubble" });
    expect(sent).toEqual([
      "JOIN #bubble/golf-0123456789",
      "SAMODE #bubble/golf-0123456789 +M",
      "SAMODE #bubble/golf-0123456789 -i",
    ]);
  });

  it("makes the main room of a world the file does not list, in that world", () => {
    const { db, rooms } = realmSetup();
    expect(rooms.realm("#leon")).toEqual({ made: "#leon" });
    expect(listRooms(db)).toContainEqual({ name: "#leon", world: "leon" });
  });

  it("is made once: asked again, it exists and nothing is sent", () => {
    const { sent, rooms } = realmSetup();
    expect([rooms.realm("#bubble/golf-0123456789"), rooms.realm("#bubble/golf-0123456789")]).toEqual([
      { made: "#bubble/golf-0123456789" },
      "exists",
    ]);
    expect(rooms.realm("#bubble")).toBe("exists");
    expect(sent).toHaveLength(3);
  });

  it("is held to its own cap, which counts the realm rooms of every world and no other room", () => {
    const { rooms } = realmSetup({ realmMax: 2 });
    expect(rooms.create("bubble", "garden")).toEqual({ made: "#bubble/garden" });
    expect([rooms.realm("#bubble/a-0000000000"), rooms.realm("#leon"), rooms.realm("#bubble/b-1111111111")]).toEqual([
      { made: "#bubble/a-0000000000" },
      { made: "#leon" },
      "full",
    ]);
    expect(rooms.realm("#bubble/a-0000000000")).toBe("exists");
  });

  it("takes nothing from a world's cap of moderators' rooms, and its rooms are never counted in it", () => {
    const { rooms } = realmSetup({ max: 1 });
    expect([rooms.realm("#bubble/a-0000000000"), rooms.realm("#bubble/b-1111111111")]).toEqual([
      { made: "#bubble/a-0000000000" },
      { made: "#bubble/b-1111111111" },
    ]);
    expect([rooms.create("bubble", "garden"), rooms.create("bubble", "pond")]).toEqual([
      { made: "#bubble/garden" },
      "full",
    ]);
  });

  it("is archived like any room, and then still exists", () => {
    const { rooms } = realmSetup();
    rooms.realm("#bubble/golf-0123456789");
    expect(rooms.archive("bubble", "golf-0123456789")).toBe("archived");
    expect(rooms.realm("#bubble/golf-0123456789")).toBe("exists");
  });

  it("clashes with a moderator's room of the same name in either order: the first stays, the second finds it there", () => {
    const { rooms } = realmSetup();
    rooms.create("bubble", "golf-0123456789");
    expect(rooms.realm("#bubble/golf-0123456789")).toBe("exists");
    rooms.realm("#bubble/pond-0123456789");
    expect(rooms.create("bubble", "pond-0123456789")).toBe("exists");
  });

  it("still counts an archived realm room in its cap", () => {
    const { rooms } = realmSetup({ realmMax: 1 });
    rooms.realm("#bubble/a-0000000000");
    rooms.archive("bubble", "a-0000000000");
    expect(rooms.realm("#bubble/b-1111111111")).toBe("full");
  });
});

// D394: on the Earth any account makes a room, 3 a day, a thousand in all, apart from the moderators' 20.
describe("a room anyone makes on the Earth", () => {
  const A = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
  const B = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

  it("is made as #earth/name, joined and open like a moderator's, its maker recorded", () => {
    const { sent, rooms } = setup();
    expect(rooms.earth(A, "coffee")).toEqual({ made: "#earth/coffee" });
    expect(sent).toEqual(["JOIN #earth/coffee", "SAMODE #earth/coffee +M", "SAMODE #earth/coffee -i"]);
    expect([rooms.maker("#earth/coffee"), rooms.maker("#earth"), rooms.maker("#earth/none")]).toEqual([
      A,
      undefined,
      undefined,
    ]);
    rooms.create("earth", "staff");
    expect(rooms.maker("#earth/staff")).toBeUndefined();
  });

  it("is made once: a name taken, by anyone, is refused, and a name too long for Ergo's 64", () => {
    const { rooms } = setup();
    rooms.create("earth", "taken");
    rooms.earth(A, "mine");
    expect([rooms.earth(B, "taken"), rooms.earth(B, "mine"), rooms.earth(B, "a".repeat(60))]).toEqual([
      "exists",
      "exists",
      "too_long",
    ]);
  });

  it("is 3 a day for an account, archived ones counted, each account apart, a new day giving 3 more", () => {
    const { rooms, clock } = setup();
    expect(["a", "b", "c"].map((name) => typeof rooms.earth(A, name))).toEqual(["object", "object", "object"]);
    rooms.archive("earth", "a");
    expect(rooms.earth(A, "d")).toBe("day");
    expect(rooms.earth(B, "d")).toEqual({ made: "#earth/d" });
    clock.now += 24 * 60 * 60_000 + 1;
    expect(rooms.earth(A, "d")).toBe("exists");
    expect(rooms.earth(A, "e")).toEqual({ made: "#earth/e" });
  });

  it("is a thousand at most, whatever the world's cap, and takes nothing of the moderators' cap", () => {
    const { rooms } = setup({ max: 1, earthMax: 2 });
    expect([rooms.earth(A, "a"), rooms.earth(B, "b"), rooms.earth(B, "c")]).toEqual([
      { made: "#earth/a" },
      { made: "#earth/b" },
      "full",
    ]);
    expect(rooms.create("earth", "moderated")).toEqual({ made: "#earth/moderated" });
    expect(rooms.create("earth", "moderated-two")).toBe("full");
  });

  it("says before any work what it would answer, as the route asks it before it pays for the name's check", () => {
    const { rooms, sent } = setup();
    for (const name of ["a", "b", "c"]) rooms.earth(A, name);
    sent.length = 0;
    expect([rooms.mayEarth(A, "d"), rooms.mayEarth(B, "d"), rooms.mayEarth(B, "a")]).toEqual(["day", "ok", "exists"]);
    expect(sent).toEqual([]);
    expect(rooms.exists("#earth/d")).toBe(false);
  });

  it("is held to 3 a day and a thousand rooms, as D394 says", () => {
    expect([EARTH_PER_DAY, EARTH_ROOMS_MAX]).toEqual([3, 1000]);
  });

  it("gives 3 more at exactly 24 hours, and none a millisecond before", () => {
    const { rooms, clock } = setup();
    for (const name of ["a", "b", "c"]) rooms.earth(A, name);
    clock.now += 24 * 60 * 60_000 - 1;
    expect(rooms.earth(A, "d")).toBe("day");
    clock.now += 1;
    expect(rooms.earth(A, "d")).toEqual({ made: "#earth/d" });
  });

  it("counts the live rooms in the cap: an archived one frees its place, its name kept, and the day's count stays", () => {
    const { rooms } = setup({ earthMax: 2 });
    rooms.earth(A, "a");
    rooms.earth(B, "b");
    expect(rooms.earth(B, "c")).toBe("full");
    rooms.archive("earth", "a");
    expect(rooms.earth(B, "c")).toEqual({ made: "#earth/c" });
    expect(rooms.earth(A, "a")).toBe("exists");
  });

  it("is not stopped by the moderators' 20 rooms made, nor counts the realm rooms in its cap", () => {
    const { rooms } = setup({ max: 20, earthMax: 1 });
    for (let n = 0; n < 20; n += 1) rooms.create("earth", `staff-${String(n)}`);
    rooms.realm("#earth/some-realm-0123456789");
    expect(rooms.earth(A, "a")).toEqual({ made: "#earth/a" });
    expect(rooms.earth(B, "b")).toBe("full");
  });

  it("keeps 5,000 rooms at most, archived ones included, so making and archiving frees no place for ever", () => {
    expect(EARTH_ROWS_MAX).toBe(5000);
    const { rooms } = setup({ earthRowsMax: 2 });
    rooms.earth(A, "a");
    rooms.earth(B, "b");
    rooms.archive("earth", "a");
    expect(rooms.earth(B, "c")).toBe("full");
  });
});

describe("the realm rooms' reserve and who owns a room", () => {
  const room = (k: number): string => `#bubble/r${String(k)}-0123456789`;
  const again = (db: DatabaseSync, realmMax: number) =>
    makeRooms({ db, send: () => true, now: () => T0, max: 20, realmMax });
  const make = (realmMax: number) => {
    const db = openDatabase(":memory:", [ROOM_TABLES, ROOM_STATE, REALM_TABLES, REALM_PATH, EARTH_TABLES]);
    opened.push(db);
    ensureRooms(db, ["bubble"], T0);
    return { db, rooms: again(db, realmMax) };
  };

  it("answers full for a room to make once the realm rooms reach the cap less the reserve it was given, ok with none, and exists for one made", () => {
    const { rooms } = make(5);
    for (let k = 0; k < 3; k += 1) rooms.realm(room(k));
    expect(rooms.mayRealm(room(9))).toBe("ok");
    expect(rooms.mayRealm(room(9), 2)).toBe("full");
    expect(rooms.mayRealm(room(9), 1)).toBe("ok");
    expect(rooms.mayRealm(room(0), 5)).toBe("exists");
  });

  it("says a room is a realm's only when it was made as one, not a moderator's room and not the main room of a world", () => {
    const { db, rooms } = make(5);
    rooms.realm(room(1));
    rooms.create("bubble", "garden");
    // Kept in the database: a new process over it knows the same rooms.
    expect(again(db, 5).isRealm(room(1))).toBe(true);
    expect([
      rooms.isRealm(room(1)),
      rooms.isRealm("#bubble/garden"),
      rooms.isRealm("#bubble"),
      rooms.isRealm("#none"),
    ]).toEqual([true, false, false, false]);
  });

  it("makes a room to make only below the cap less the reserve it is given, and the cap alone with none", () => {
    const { rooms } = make(3);
    expect(rooms.realm(room(0), 1)).toEqual({ made: room(0) });
    expect(rooms.realm(room(1), 1)).toEqual({ made: room(1) });
    expect(rooms.realm(room(2), 1)).toBe("full");
    expect(rooms.realm(room(2))).toEqual({ made: room(2) });
    expect(rooms.realm(room(3))).toBe("full");
  });
});
