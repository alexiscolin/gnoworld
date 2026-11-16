import { mkdtempSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "@gnoworld/service/db";
import { makeChecker, VERDICT_TABLES } from "../moderation/check.ts";
import { LOGIN_TABLES } from "../login/login.ts";
import { GUEST_TABLES } from "../guest/guests.ts";
import { PROGRESS_TABLES } from "../moderation/catchup.ts";
import { MUTE_TABLES } from "../moderation/mute.ts";
import { STRIKE_TABLES } from "../moderation/strikes.ts";
import { PIN_TABLES } from "../pins/pins.ts";
import { makeRetention } from "../retention/retention.ts";
import { answer } from "../testing/answers.ts";
import { logger } from "@gnoworld/service/log";
import { guestSaid, idleRooms, ROOM_SAID, roomCounts, sweepIdle } from "./earth.ts";
import { EARTH_TABLES, makeRooms, REALM_PATH, REALM_TABLES, ROOM_STATE } from "./create.ts";
import { migrations } from "../migrations.ts";
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
    LOGIN_TABLES,
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
  // A guest's relayed line leaves no verdict: the room's count for its hour is the line.
  const said = (room: string, at: number) => {
    guestSaid(db)(room, at);
  };
  return { db, clock, rooms, sent, line, said };
};

describe("the messages of a room in a day", () => {
  it("counts the lines of each room since the time given, a hidden line and an older one left out", () => {
    const { db, said } = setup();
    said("#earth/a", T0 - 1000);
    said("#earth/a", T0 - 2000);
    said("#earth/a", T0 - 2 * DAY);
    said("#earth/b", T0 - 5000);
    expect([...roomCounts(db, T0 - DAY)]).toEqual([
      ["#earth/a", 2],
      ["#earth/b", 1],
    ]);
  });
});

describe("the rooms nobody writes in", () => {
  it("are the Earth's public rooms made before the cutoff, live, with no line since it; hidden lines are no line", () => {
    const { clock, rooms, said, db } = setup();
    for (const name of ["quiet", "busy", "hushed"]) rooms.earth(A, name);
    clock.now = T0;
    rooms.earth(B, "fresh");
    rooms.create("earth", "moderated");
    said("#earth/busy", T0 - 3 * DAY);
    said("#earth/quiet", T0 - 20 * DAY);
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
    const { clock, rooms, said, db } = setup();
    const cutoff = T0 - 14 * DAY;
    clock.now = cutoff;
    rooms.earth(A, "at-cutoff");
    clock.now = cutoff - 1;
    rooms.earth(A, "line-at-cutoff");
    rooms.earth(A, "unchecked-line");
    rooms.earth(B, "one-ms-before");
    said("#earth/line-at-cutoff", cutoff);
    said("#earth/unchecked-line", cutoff + 5);
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

  it("adds each line to its room's count, an account's and a guest's alike", () => {
    const { said, db } = setup();
    said("#earth/mixed", T0 - 500);
    said("#earth/mixed", T0 - 400);
    expect(roomCounts(db, T0 - DAY).get("#earth/mixed")).toBe(2);
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

// F13500: the verdicts are capped (retention's maxVerdicts), so a room's lines must not be read from them: every line that
// passes is counted in room_said, whose retention keeps 25 hours and each room's latest hour.
describe("a room older than 14 days, active, with the verdicts capped (F13500)", () => {
  it("is never archived when the cap has dropped its line from the verdicts: its line was counted in room_said as it passed", async () => {
    const { clock, rooms, db } = setup();
    rooms.earth(A, "active");
    clock.now = T0;
    // The tables the retention sweeps beside the verdicts.
    for (const tables of [PIN_TABLES, GUEST_TABLES, PROGRESS_TABLES, MUTE_TABLES, STRIKE_TABLES]) db.exec(tables);
    const log = logger("a-pepper-of-forty-characters-0123456789", () => true);
    let at = T0 - 2 * DAY;
    const check = makeChecker({
      db,
      rulesOf: () => ({ bannedWords: [], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 }),
      provider: () => Promise.resolve(answer()),
      thresholds: {},
      pepper: "a-pepper-of-forty-characters-0123456789",
      log,
      now: () => at,
    });
    db.prepare("INSERT INTO accounts (address, first_seen) VALUES (?, ?)").run(B, T0 - 60 * DAY);
    await check({ room: "#earth/active", account: B, msgid: "old", text: "hello" });
    at = T0 - 60_000;
    await check({ room: "#earth/other", account: B, msgid: "new1", text: "hello" });
    await check({ room: "#earth/other", account: B, msgid: "new2", text: "hello" });
    // The cap (maxVerdicts: 2) takes the two-day-old verdict, the oldest.
    makeRetention(db, { log, now: () => T0, maxVerdicts: 2 }).tick();
    expect(db.prepare("SELECT count(*) AS n FROM verdicts WHERE room = '#earth/active'").get()).toEqual({ n: 0 });
    expect(sweepIdle(db, rooms, { now: T0, reserved: () => false })).toEqual([]);
    expect(rooms.archived("#earth/active")).toBe(false);
  });

  it("is archived by a verdict row alone no more: a line only the verdicts hold is no line", () => {
    const { clock, rooms, line, db } = setup();
    rooms.earth(A, "verdict-only");
    clock.now = T0;
    line("#earth/verdict-only", T0 - 2 * DAY);
    expect(idleRooms(db, T0 - 14 * DAY)).toEqual(["#earth/verdict-only"]);
  });

  it("counts the 24 h lines from room_said alone", () => {
    const { said, line, db } = setup();
    said("#earth/a", T0 - 1000);
    line("#earth/b", T0 - 1000);
    expect([...roomCounts(db, T0 - DAY)]).toEqual([["#earth/a", 1]]);
  });
});

describe("the backfill of room_said from the verdicts (F13501)", () => {
  it("keeps a room only accounts spoke in from the first sweep, and adds to a guest's count", () => {
    const file = join(mkdtempSync(join(tmpdir(), "backfill-")), "db.sqlite");
    const before = openDatabase(file, migrations.slice(0, 33));
    ensureRooms(before, ["earth"], T0 - 40 * DAY);
    const made = makeRooms({ db: before, send: () => true, now: () => T0 - 20 * DAY, max: 20 });
    made.earth(A, "talk");
    made.earth(A, "mixed");
    const verdict = before.prepare("INSERT INTO verdicts (msgid, room, account, action, at) VALUES (?, ?, 'h', ?, ?)");
    verdict.run("m1", "#earth/talk", "pass", T0 - 2 * DAY);
    verdict.run("m2", "#earth/mixed", "pass", T0 - 2 * DAY);
    verdict.run("m3", "#earth/mixed", "hide", T0 - 2 * DAY);
    guestSaid(before)("#earth/mixed", T0 - 2 * DAY);
    before.close();
    const db = openDatabase(file, migrations);
    opened.push(db);
    const rooms = makeRooms({ db, send: () => true, now: () => T0, max: 20 });
    expect(sweepIdle(db, rooms, { now: T0, reserved: () => false })).toEqual([]);
    expect(roomCounts(db, T0 - 3 * DAY).get("#earth/mixed")).toBe(2);
  });
});
