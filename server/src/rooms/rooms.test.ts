import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "@gnoworld/service/db";
import { ensureRooms, listRooms, mainRoom, ROOM_TABLES, roomWorld } from "./rooms.ts";

const T0 = Date.parse("2026-10-22T12:00:00.000Z");
const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});
const setup = () => {
  const db = openDatabase(":memory:", [ROOM_TABLES]);
  opened.push(db);
  return db;
};

describe("rooms", () => {
  it("names a world's main room after its slug", () => {
    expect([mainRoom("earth"), mainRoom("bubble"), mainRoom("a-b-1")]).toEqual(["#earth", "#bubble", "#a-b-1"]);
  });

  it("names a room's world, and none for a room it never made", () => {
    const db = setup();
    ensureRooms(db, ["earth"], T0);
    expect([roomWorld(db, "#earth"), roomWorld(db, "#nope")]).toEqual(["earth", undefined]);
  });

  it("makes each world's main room and no other, and lists them by name", () => {
    const db = setup();
    ensureRooms(db, ["earth", "bubble"], T0);
    expect(listRooms(db)).toEqual([
      { name: "#bubble", world: "bubble" },
      { name: "#earth", world: "earth" },
    ]);
  });

  it("changes nothing at a second start, the first day kept, and adds a world named later", () => {
    const db = setup();
    ensureRooms(db, ["earth"], T0);
    ensureRooms(db, ["earth", "bubble"], T0 + 1000);
    expect(db.prepare("SELECT name, world, created_at FROM rooms ORDER BY name").all()).toEqual([
      { name: "#bubble", world: "bubble", created_at: T0 + 1000 },
      { name: "#earth", world: "earth", created_at: T0 },
    ]);
  });

  it("keeps a room whose world left the file: its history stays (removal is a moderator's, 3l)", () => {
    const db = setup();
    ensureRooms(db, ["earth", "bubble"], T0);
    ensureRooms(db, ["earth"], T0);
    expect(listRooms(db).map(({ name }) => name)).toEqual(["#bubble", "#earth"]);
  });
});
