import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { openDatabase } from "../db.ts";
import { makeRooms, ROOM_STATE } from "./create.ts";
import { ensureRooms, listRooms, ROOM_TABLES } from "./rooms.ts";

const T0 = Date.parse("2026-10-22T12:00:00.000Z");
const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

const setup = ({ max = 20 }: { max?: number } = {}) => {
  const db = openDatabase(":memory:", [ROOM_TABLES, ROOM_STATE]);
  opened.push(db);
  ensureRooms(db, ["bubble", "earth"], T0);
  const link = { up: true };
  const sent: string[] = [];
  const rooms = makeRooms({
    db,
    send: (command, params) => {
      if (!link.up) return false;
      sent.push([command, ...params].join(" "));
      return true;
    },
    now: () => T0,
    max,
  });
  const archived = () =>
    z
      .array(z.object({ name: z.string(), archived: z.number() }))
      .parse(db.prepare("SELECT name, archived FROM rooms ORDER BY name").all());
  return { db, link, sent, rooms, archived };
};

describe("a moderator's room", () => {
  it("is made as #world/name: recorded in its world, joined, and open to accounts (+M)", () => {
    const { db, sent, rooms } = setup();
    expect(rooms.create("bubble", "garden")).toEqual({ made: "#bubble/garden" });
    expect(listRooms(db)).toContainEqual({ name: "#bubble/garden", world: "bubble" });
    expect(sent).toEqual(["JOIN #bubble/garden", "SAMODE #bubble/garden +M"]);
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

  it("is recorded while the link is down, and set when it is back", () => {
    const { link, sent, rooms } = setup();
    link.up = false;
    expect(rooms.create("bubble", "garden")).toEqual({ made: "#bubble/garden" });
    link.up = true;
    rooms.reapply();
    expect(sent).toContain("SAMODE #bubble/garden +M");
  });

  it("is archived, never destroyed: read-only (+m) and unlisted (+s), kept in its world", () => {
    const { sent, rooms, archived } = setup();
    rooms.create("bubble", "garden");
    expect(rooms.archive("bubble", "garden")).toBe("archived");
    expect(sent.slice(2)).toEqual(["SAMODE #bubble/garden +m", "SAMODE #bubble/garden +s"]);
    expect(archived()).toContainEqual({ name: "#bubble/garden", archived: 1 });
    expect(rooms.archive("bubble", "garden")).toBe("archived");
    expect(sent).toHaveLength(4);
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
        const db = openDatabase(file, [ROOM_TABLES, ROOM_STATE]);
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

  it("puts every room's modes back when the link is in its rooms: open ones +M, archived ones +m and +s too", () => {
    const { sent, rooms } = setup();
    rooms.create("bubble", "garden");
    rooms.create("bubble", "old");
    rooms.archive("bubble", "old");
    sent.splice(0);
    rooms.reapply();
    expect(sent).toEqual([
      "SAMODE #bubble +M",
      "SAMODE #bubble/garden +M",
      "SAMODE #bubble/old +M",
      "SAMODE #bubble/old +m",
      "SAMODE #bubble/old +s",
      "SAMODE #earth +M",
    ]);
  });
});
