import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "@gnoworld/service/db";
import { VERDICT_TABLES } from "../moderation/check.ts";
import { guestSaid, idleRooms, ROOM_SAID, roomCounts, sweepIdle } from "./earth.ts";
import { EARTH_TABLES, makeRooms, REALM_PATH, REALM_TABLES, ROOM_STATE } from "./create.ts";
import { ensureRooms, ROOM_TABLES } from "./rooms.ts";

const DAY = 24 * 60 * 60_000;
const T0 = Date.parse("2026-11-07T12:00:00.000Z");
const A = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const B = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

const setup = () => {
  const db = openDatabase(":memory:", [
    ROOM_TABLES,
    VERDICT_TABLES,
    ROOM_STATE,
    REALM_TABLES,
    REALM_PATH,
    EARTH_TABLES,
    ROOM_SAID,
  ]);
  opened.push(db);
  ensureRooms(db, ["earth", "bubble"], T0 - 40 * DAY);
  const clock = { now: T0 - 30 * DAY };
  const sent: string[] = [];
  const rooms = makeRooms({
    db,
    send: (command, params) => sent.push([command, ...params].join(" ")) > 0,
    now: () => clock.now,
    max: 20,
  });
  let n = 0;
  const line = (room: string, at: number, action = "pass") => {
    n += 1;
    db.prepare("INSERT INTO verdicts (msgid, room, account, action, at) VALUES (?, ?, 'h', ?, ?)").run(
      `m${String(n)}`,
      room,
      action,
      at,
    );
  };
  // A guest's relayed line leaves no verdict: the room's count for its hour is the line (D430).
  const said = (room: string, at: number) => {
    guestSaid(db)(room, at);
  };
  return { db, clock, rooms, sent, line, said };
};

describe("the messages of a room in a day", () => {
  it("counts the lines of each room since the time given, a hidden line and an older one left out", () => {
    const { db, line } = setup();
    line("#earth/a", T0 - 1000);
    line("#earth/a", T0 - 2000, "unchecked");
    line("#earth/a", T0 - 3000, "hide");
    line("#earth/a", T0 - 2 * DAY);
    line("#earth/b", T0 - 5000);
    expect([...roomCounts(db, T0 - DAY)]).toEqual([
      ["#earth/a", 2],
      ["#earth/b", 1],
    ]);
  });
});

describe("the rooms nobody writes in", () => {
  it("are the Earth's public rooms made before the cutoff, live, with no line since it; hidden lines are no line", () => {
    const { clock, rooms, line, db } = setup();
    for (const name of ["quiet", "busy", "hushed"]) rooms.earth(A, name);
    clock.now = T0;
    rooms.earth(B, "fresh");
    rooms.create("earth", "moderated");
    line("#earth/busy", T0 - 3 * DAY);
    line("#earth/hushed", T0 - 3 * DAY, "hide");
    line("#earth/quiet", T0 - 20 * DAY);
    expect(idleRooms(db, T0 - 14 * DAY).toSorted()).toEqual(["#earth/hushed", "#earth/quiet"]);
  });

  it("are archived by the sweep once, read-only and unlisted, the name kept and the cap counting it", () => {
    const { clock, rooms, sent, db } = setup();
    rooms.earth(A, "quiet");
    clock.now = T0;
    expect(sweepIdle(db, rooms, { now: T0, reserved: () => false })).toEqual(["#earth/quiet"]);
    expect(sent.slice(-2)).toEqual(["SAMODE #earth/quiet +m", "SAMODE #earth/quiet +s"]);
    expect(rooms.archived("#earth/quiet")).toBe(true);
    expect(sweepIdle(db, rooms, { now: T0, reserved: () => false })).toEqual([]);
    expect(rooms.earth(B, "quiet")).toBe("exists");
  });
});

describe("the cutoff", () => {
  it("spares a room made exactly at it and one whose last line is exactly at it, and counts an unchecked line as a line", () => {
    const { clock, rooms, line, db } = setup();
    const cutoff = T0 - 14 * DAY;
    clock.now = cutoff;
    rooms.earth(A, "at-cutoff");
    clock.now = cutoff - 1;
    rooms.earth(A, "line-at-cutoff");
    rooms.earth(A, "unchecked-line");
    rooms.earth(B, "one-ms-before");
    line("#earth/line-at-cutoff", cutoff);
    line("#earth/unchecked-line", cutoff + 5, "unchecked");
    expect(idleRooms(db, cutoff)).toEqual(["#earth/one-ms-before"]);
  });

  it("never takes a moderator's room of the Earth, whatever its age", () => {
    const { rooms, db } = setup();
    rooms.create("earth", "staff");
    expect(idleRooms(db, T0)).toEqual([]);
  });
});

describe("the sweep and the roles file", () => {
  it("spares a room the file has since typed or placed in a section", () => {
    const { rooms, db } = setup();
    rooms.earth(A, "kept");
    rooms.earth(A, "gone");
    expect(sweepIdle(db, rooms, { now: T0, reserved: (room) => room === "#earth/kept" })).toEqual(["#earth/gone"]);
    expect(rooms.archived("#earth/kept")).toBe(false);
  });
});

describe("a room only guests speak in (D430): its relayed lines leave no verdict", () => {
  const HOUR = 60 * 60_000;

  it("is not swept when a guest spoke since the cutoff, and is when the last guest line is older", () => {
    const { clock, rooms, said, db } = setup();
    for (const name of ["guests-only", "guests-long-ago", "nobody"]) rooms.earth(A, name);
    clock.now = T0;
    said("#earth/guests-only", T0 - 1 * DAY);
    said("#earth/guests-long-ago", T0 - 20 * DAY);
    expect(idleRooms(db, T0 - 14 * DAY).toSorted()).toEqual(["#earth/guests-long-ago", "#earth/nobody"]);
  });

  it("spares a room whose guest line is exactly at the cutoff, as an account's line is", () => {
    const { clock, rooms, said, db } = setup();
    rooms.earth(A, "edge");
    clock.now = T0;
    said("#earth/edge", T0 - 14 * DAY);
    expect(idleRooms(db, T0 - 14 * DAY)).toEqual([]);
  });

  it("shows the guests' real lines of the day in the room list: each relayed line counts, those of the last 24 hours added", () => {
    const { said, db } = setup();
    for (const at of [T0 - 1000, T0 - 2000, T0 - 3 * HOUR]) said("#earth/guests-only", at);
    said("#earth/old", T0 - 2 * DAY);
    const counts = roomCounts(db, T0 - DAY);
    expect(counts.get("#earth/guests-only")).toBe(3);
    expect(counts.has("#earth/old")).toBe(false);
  });

  it("counts a guest line exactly at the time given, and none from two hours before it", () => {
    const { said, db } = setup();
    const since = T0 - DAY;
    said("#earth/at-since", since);
    said("#earth/long-before", since - 2 * HOUR);
    const counts = roomCounts(db, since);
    expect(counts.get("#earth/at-since")).toBe(1);
    expect(counts.has("#earth/long-before")).toBe(false);
  });

  it("adds a guest's lines to a room's verdict lines, never replacing them", () => {
    const { said, line, db } = setup();
    line("#earth/mixed", T0 - 1000);
    line("#earth/mixed", T0 - 2000);
    said("#earth/mixed", T0 - 500);
    said("#earth/mixed", T0 - 400);
    expect(roomCounts(db, T0 - DAY).get("#earth/mixed")).toBe(4);
  });

  it("counts a line once for each relay: two in one hour make one row of 2, and an hour on makes another", () => {
    const { said, db } = setup();
    said("#earth/a", T0);
    said("#earth/a", T0 + 1000);
    said("#earth/a", T0 + HOUR);
    expect(db.prepare("SELECT n FROM room_said ORDER BY hour").all()).toEqual([{ n: 2 }, { n: 1 }]);
  });

  it("sweeps nothing of a room a guest spoke in, and archives the quiet one beside it", () => {
    const { clock, rooms, said, sent, db } = setup();
    rooms.earth(A, "guests-only");
    rooms.earth(A, "quiet");
    clock.now = T0;
    said("#earth/guests-only", T0 - 2 * DAY);
    expect(sweepIdle(db, rooms, { now: T0, reserved: () => false })).toEqual(["#earth/quiet"]);
    expect(rooms.archived("#earth/guests-only")).toBe(false);
    expect(sent).not.toContain("SAMODE #earth/guests-only +m");
    expect(sent).toContain("SAMODE #earth/quiet +m");
  });
});
