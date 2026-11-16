import { describe, expect, it } from "vitest";
import { openDatabase } from "@gnoworld/service/db";
import type { Log } from "@gnoworld/service/log";
import type { Mutes } from "../moderation/mute.ts";
import { EARTH_TABLES, makeRooms, REALM_PATH, REALM_TABLES, ROOM_STATE, type Rooms } from "./create.ts";
import type { Reconciler } from "./reconcile.ts";
import { ensureRooms, ROOM_TABLES } from "./rooms.ts";
import { keeping, reconcilerFor } from "./wire.ts";

describe("the rooms as the routes use them", () => {
  // A keeper that makes #bubble/garden, refuses any other name, and archives only #bubble/garden.
  const keeper: Rooms = {
    create: (world, name) => (name === "garden" ? { made: `#${world}/${name}` } : "exists"),
    archive: (_, name) => (name === "garden" ? "archived" : "not_found"),
    archived: () => false,
    exists: () => false,
    mayEarth: () => "ok",
    mayRealm: () => "ok",
    isRealm: () => false,
    tagRealm: () => undefined,
    earth: (_, name) => (name === "cafe" ? { made: `#earth/${name}` } : "exists"),
    maker: () => undefined,
    realm: (room) => (room === "#bubble/golf-0123456789" ? { made: room } : "exists"),
  };
  const wired = () => {
    const calls: string[] = [];
    const mutes: Mutes = {
      muteKeeping: () => "muted",
      mute: () => true,
      tick: () => undefined,
      reapply: () => undefined,
      putOn: (room, world) => calls.push(`putOn ${room} ${world}`),
    };
    const reconciler: Reconciler = {
      ask: (room) => calls.push(`ask ${room ?? ""}`),
      pass: () => Promise.resolve(),
      joined: () => undefined,
      flags: () => undefined,
    };
    return { calls, rooms: keeping(keeper, { mutes, reconciler }) };
  };

  it("puts the world's mutes on a room made, and on nothing for a create refused", () => {
    const { calls, rooms } = wired();
    expect([rooms.create("bubble", "pond"), rooms.create("bubble", "garden")]).toEqual([
      "exists",
      { made: "#bubble/garden" },
    ]);
    expect(calls).toEqual(["putOn #bubble/garden bubble"]);
  });

  it("puts the world's mutes on a realm's room made, and on nothing for one that exists", () => {
    const { calls, rooms } = wired();
    expect([rooms.realm("#bubble/other-0000000000"), rooms.realm("#bubble/golf-0123456789")]).toEqual([
      "exists",
      { made: "#bubble/golf-0123456789" },
    ]);
    expect(calls).toEqual(["putOn #bubble/golf-0123456789 bubble"]);
  });

  it("puts the Earth's mutes on a public room made, and on nothing for one refused", () => {
    const { calls, rooms } = wired();
    expect([rooms.earth("g1x", "pond"), rooms.earth("g1x", "cafe")]).toEqual(["exists", { made: "#earth/cafe" }]);
    expect(calls).toEqual(["putOn #earth/cafe earth"]);
  });

  it("asks the reconciler for a room archived, and for nothing when no such room is found", () => {
    const { calls, rooms } = wired();
    expect([rooms.archive("bubble", "pond"), rooms.archive("bubble", "garden")]).toEqual(["not_found", "archived"]);
    expect(calls).toEqual(["ask #bubble/garden"]);
  });
});

describe("the reconciler's rooms", () => {
  it("walks the live rooms and the window's archived ones, never an archived Earth room made before the window", async () => {
    const T0 = Date.parse("2026-10-22T12:00:00.000Z");
    const db = openDatabase(":memory:", [ROOM_TABLES, ROOM_STATE, REALM_TABLES, REALM_PATH, EARTH_TABLES]);
    const clock = { now: T0 };
    ensureRooms(db, ["earth"], T0);
    const keeper = makeRooms({ db, send: () => true, now: () => clock.now, max: 20 });
    keeper.earth("g1a", "old");
    keeper.archive("earth", "old");
    clock.now += 31 * 24 * 60 * 60_000;
    keeper.earth("g1a", "new");
    const log: Log = () => undefined;
    const asked: string[] = [];
    const reconciler = reconcilerFor(
      db,
      { worlds: new Map() },
      {
        keeper,
        now: () => clock.now,
        send: () => true,
        log,
        state: (room) => {
          asked.push(room);
          return Promise.resolve(undefined);
        },
      },
    );
    await reconciler.pass();
    expect(asked).toEqual(["#earth", "#earth/new"]);
    db.close();
  });
});
