import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { realmRoom, worldIdOf } from "@gnoworld/core";
import { Hubs, RoomId } from "@gnoworld/schemas";
import { Worlds } from "@gnoworld/schemas/indexer";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { aheadRooms } from "./ahead.ts";
import { worldsListing } from "../worlds/known.ts";
import { EARTH_TABLES, REALM_PATH, REALM_TABLES, ROOM_STATE, type Rooms, makeRooms } from "./create.ts";
import { ROOM_TABLES, ensureRooms, listRooms, realmPaths, roomWorld, worldOf } from "./rooms.ts";
import { z } from "zod";

// D413: the room of every realm the worlds job lists, and every hub's main room, exist before anyone opens a page.
const T0 = Date.parse("2026-11-08T12:00:00.000Z");
const PATHS = readFileSync(new URL("../worlds/onyxPaths.txt", import.meta.url), "utf8")
  .split("\n")
  .filter((line) => line.startsWith("gno.land/r/"));
const HUBS = Hubs.parse(
  JSON.parse(readFileSync(new URL("../../../app/data/hubs.json", import.meta.url), "utf8")),
).filter((hub) => hub.universe === "onyx");
const dir = mkdtempSync(join(tmpdir(), "gnoworld-ahead-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

let n = 0;
// The file as the job writes it, each realm in the world its path names, checked against the worlds' schema.
interface Made {
  at?: number;
  file?: string;
  calls?: Readonly<Record<string, number>>;
}
const written = (paths: readonly string[], at = 1_000, file?: string): string =>
  build(paths, { at, ...(file === undefined ? {} : { file }) });
const called = (paths: readonly string[], calls: Readonly<Record<string, number>>): string => build(paths, { calls });
const build = (
  paths: readonly string[],
  { at = 1_000, file = join(dir, `worlds-${String((n += 1))}.json`), calls = {} }: Made,
): string => {
  const ids = [...new Set(paths.map(worldIdOf))];
  const realm = (path: string) => ({
    path,
    deployer: null,
    deployerName: null,
    functions: [],
    imports: [],
    calls: calls[path] ?? null,
    callers: null,
    lastHeight: null,
  });
  const worlds = ids.map((id) => ({
    id,
    namespace: id.split("/")[0] ?? id,
    realms: paths.filter((path) => worldIdOf(path) === id).map(realm),
  }));
  const doc = { version: 1, universe: "onyx", updated: "2026-11-08T10:00:00.000Z", worlds };
  writeFileSync(file, JSON.stringify(Worlds.parse(doc)));
  utimesSync(file, at / 1_000, at / 1_000);
  return file;
};

// Everything the bot is told and every wait, in the order they happen.
interface Timeline {
  events: string[];
  waits: number[];
}
// The distinct rooms of the 743 paths: versions of one realm share a room.
const DISTINCT = new Set(PATHS.map((path) => realmRoom(path, []).room)).size;
const setup = ({
  realmMax,
  hubs = [],
  perSecond,
  seeded = false,
  send = true,
}: { realmMax?: number; hubs?: typeof HUBS; perSecond?: number; seeded?: boolean; send?: boolean } = {}) => {
  const db = openDatabase(":memory:", [ROOM_TABLES, ROOM_STATE, REALM_TABLES, REALM_PATH, EARTH_TABLES]);
  opened.push(db);
  // The hubs as the process has them before this part: chat.ts makes a main room for every world of the roles file.
  ensureRooms(db, seeded ? ["earth", ...HUBS.map(({ slug }) => slug)] : ["earth"], T0);
  const timeline: Timeline = { events: [], waits: [] };
  const sent: string[] = [];
  const rooms: Rooms = makeRooms({
    db,
    send: (command, params) => {
      const line = [command, ...params].join(" ");
      sent.push(line);
      timeline.events.push(line);
      return send;
    },
    now: () => T0,
    max: 20,
    ...(realmMax === undefined ? {} : { realmMax }),
  });
  const lines: string[] = [];
  const log = logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line));
  // A wait that lasts until a test releases it, when it asked to hold.
  const gate = { wait: Promise.resolve() };
  const hold = (): (() => void) => {
    let release = (): void => undefined;
    gate.wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    return release;
  };
  const wait = (ms: number): Promise<void> => {
    timeline.waits.push(ms);
    timeline.events.push(`wait ${String(ms)}`);
    return gate.wait;
  };
  const start = (file: string, over: { stopAt?: number } = {}) => {
    const ahead = aheadRooms({
      file,
      rooms,
      hubs,
      log,
      wait: (ms) => {
        if (over.stopAt !== undefined && timeline.waits.length >= over.stopAt) ahead.stop();
        return wait(ms);
      },
      ...(perSecond === undefined ? {} : { perSecond }),
    });
    return ahead;
  };
  const events = () => lines.map((line) => line.replace(/^\{"time":"[^"]+",/, "{").trimEnd());
  const joined = () => sent.filter((line) => line.startsWith("JOIN "));
  return { db, rooms, sent, timeline, start, events, joined, hold };
};
const names = (db: DatabaseSync): string[] => listRooms(db).map(({ name }) => name);
// The most JOINs between two waits (or before the first, or after the last).
const burst = ({ events }: Timeline): number =>
  Math.max(
    ...events
      .join("\n")
      .split(/^wait \d+$/m)
      .map((part) => part.split("\n").filter((line) => line.startsWith("JOIN ")).length),
  );

describe("rooms made ahead from the worlds job's list", () => {
  it("makes the room of every one of the job's 743 onyx paths before anyone opens its page, with the shipped hubs", async () => {
    const { db, rooms, start } = setup({ hubs: HUBS });
    await start(written(PATHS)).check();
    for (const path of PATHS) {
      const { world, room } = realmRoom(path, HUBS);
      expect(rooms.exists(room), path).toBe(true);
      expect(worldOf(room), path).toBe(world);
      // The bot and the guest route read the rooms table's world column, not the name.
      expect(roomWorld(db, room), path).toBe(world);
    }
    const wanted = new Set(PATHS.map((path) => realmRoom(path, HUBS).room));
    expect(new Set(names(db).filter((name) => name !== "#earth"))).toEqual(
      new Set([...wanted, ...HUBS.map(({ slug }) => `#${slug}`)]),
    );
  });

  it("joins each room once, and opens it to accounts and to all, as a room made on a first open is", async () => {
    const { sent, joined, start } = setup();
    await start(written(["gno.land/r/leon", "gno.land/r/gnogolf/golf_a/v2"])).check();
    const golf = realmRoom("gno.land/r/gnogolf/golf_a/v2", []).room;
    expect(joined()).toEqual(["JOIN #leon", `JOIN ${golf}`]);
    expect(sent).toContain("SAMODE #leon +M");
    expect(sent).toContain("SAMODE #leon -i");
    expect(sent).toContain(`SAMODE ${golf} +M`);
    expect(sent).toContain(`SAMODE ${golf} -i`);
  });

  it("records the realm of each room it makes, and tells a room made before the path was kept (a backfill)", async () => {
    const { db, rooms, start } = setup();
    const golf = realmRoom("gno.land/r/gnogolf/golf_a/v2", []).room;
    // Made as the version before this one made it: a row with no path.
    rooms.realm("#leon");
    await start(written(["gno.land/r/leon", "gno.land/r/gnogolf/golf_a/v2"])).check();
    expect(realmPaths(db, "leon")).toEqual(new Map([["#leon", "gno.land/r/leon"]]));
    expect([...realmPaths(db, worldOf(golf)).values()]).toEqual(["gno.land/r/gnogolf/golf_a/v2"]);
  });

  it("makes every hub's main room, even for a hub that lists no realm, and with no worlds file at all", async () => {
    const { db, start } = setup({ hubs: HUBS });
    await start(join(dir, "never-written.json")).check();
    expect(names(db).filter((name) => name !== "#earth")).toEqual(HUBS.map(({ slug }) => `#${slug}`).toSorted());
    expect(HUBS.length).toBeGreaterThan(1);
  });

  it("sends nothing for the hubs' main rooms the roles file made already, and leaves the realm cap's count alone", async () => {
    const { db, sent, start } = setup({ hubs: HUBS, seeded: true });
    await start(join(dir, "never-written.json")).check();
    expect(sent).toEqual([]);
    expect(db.prepare("SELECT count(*) AS n FROM realm_rooms").get()).toEqual({ n: 0 });
  });

  it("makes the hubs' main rooms before any realm's when the cap is short: no realm room is made while a hub has none", async () => {
    const { db, start } = setup({ hubs: HUBS, realmMax: HUBS.length });
    await start(written(PATHS)).check();
    const made = names(db).filter((name) => name !== "#earth");
    expect(made.toSorted()).toEqual(HUBS.map(({ slug }) => `#${slug}`).toSorted());
  });

  it("records a room and goes on when the link is down at start (send false), makes none twice, and joins none again by itself", async () => {
    const { db, sent, start } = setup({ send: false });
    const file = written(["gno.land/r/leon", "gno.land/r/other"]);
    const ahead = start(file);
    await ahead.check();
    expect(names(db)).toEqual(["#earth", "#leon", "#other"]);
    const before = sent.length;
    written(["gno.land/r/leon", "gno.land/r/other"], 8_000, file);
    await ahead.check();
    expect(sent.length).toBe(before);
  });

  it("makes nothing twice: a second check, and a new process over the same database, send no command", async () => {
    const { rooms, sent, timeline, start } = setup({ hubs: HUBS });
    const file = written(PATHS.slice(0, 30));
    await start(file).check();
    const before = [sent.length, timeline.waits.length];
    expect(before[0]).toBeGreaterThan(30 * 3);
    await start(file).check();
    expect([sent.length, timeline.waits.length]).toEqual(before);
    // A new process has no memory of the file's time: it reads the file, finds every room there, and makes none.
    const again = aheadRooms({ file, rooms, hubs: HUBS, log: () => undefined, wait: () => Promise.resolve() });
    await again.check();
    expect(sent.length).toBe(before[0]);
  });

  it("makes the rooms a later job run adds, and only those, once the file is written anew", async () => {
    const { rooms, joined, start } = setup();
    const file = written(["gno.land/r/leon"], 1_000);
    const ahead = start(file);
    await ahead.check();
    expect(joined()).toEqual(["JOIN #leon"]);
    // The same file, unchanged in time: not read again, whatever it now holds.
    written(["gno.land/r/leon", "gno.land/r/other"], 1_000, file);
    await ahead.check();
    expect(rooms.exists("#other")).toBe(false);
    // The job writes it anew: its new realm gets its room, the old one is not joined again.
    written(["gno.land/r/leon", "gno.land/r/other"], 2_000, file);
    await ahead.check();
    expect(joined()).toEqual(["JOIN #leon", "JOIN #other"]);
  });

  it("makes no realm room, throws nothing and logs no path for a worlds file that is missing, broken or not the worlds'", async () => {
    const { db, events, start } = setup();
    const broken = join(dir, "broken.json");
    writeFileSync(broken, "{");
    const other = join(dir, "other.json");
    writeFileSync(other, JSON.stringify({ version: 2 }));
    for (const file of [join(dir, "missing.json"), broken, other]) await start(file).check();
    expect(names(db)).toEqual(["#earth"]);
    expect(events().join("\n")).not.toContain("gno.land");
    // A broken file does not wedge the job: the file written right after it is read.
    const ahead = start(broken);
    await ahead.check();
    written(["gno.land/r/leon"], 7_000, broken);
    await ahead.check();
    expect(names(db)).toEqual(["#earth", "#leon"]);
  });
});

describe("the pace of the rooms made ahead", () => {
  it("waits a second after every perSecond rooms, never more than perSecond rooms between two waits", async () => {
    const { timeline, joined, start } = setup({ perSecond: 10 });
    await start(written(PATHS.slice(0, 25))).check();
    // 25 paths, 24 rooms: two versions of one realm share theirs.
    expect(joined().length).toBe(new Set(PATHS.slice(0, 25).map((path) => realmRoom(path, []).room)).size);
    expect(burst(timeline)).toBe(10);
    expect(timeline.waits).toEqual([1_000, 1_000]);
  });

  it("keeps the shipped pace at a few rooms a second: 20 at most, so the 743 paths take 5 to 150 s", async () => {
    const { timeline, joined, start } = setup();
    await start(written(PATHS)).check();
    expect(joined().length).toBe(DISTINCT);
    expect(burst(timeline)).toBeLessThanOrEqual(20);
    expect(burst(timeline)).toBeGreaterThanOrEqual(5);
    expect(timeline.waits.length).toBeGreaterThanOrEqual(Math.floor(DISTINCT / 20) - 1);
    expect(timeline.waits.length).toBeLessThanOrEqual(Math.ceil(DISTINCT / 5));
    expect(timeline.waits.every((ms) => ms === 1_000)).toBe(true);
  });

  it("waits for no room that exists already: a second check, or a list of rooms made, costs no time", async () => {
    const { timeline, start } = setup({ perSecond: 5 });
    const file = written(PATHS.slice(0, 12));
    await start(file).check();
    const waited = timeline.waits.length;
    expect(waited).toBe(2);
    written(PATHS.slice(0, 12), 5_000, file);
    await start(file).check();
    expect(timeline.waits.length).toBe(waited);
  });

  it("stops at its next wait once stopped, makes no room after it, and leaves the rest for the next start", async () => {
    const { db, joined, start } = setup({ perSecond: 4 });
    const file = written(PATHS.slice(0, 20));
    await start(file, { stopAt: 1 }).check();
    const made = joined().length;
    expect(made).toBeGreaterThan(0);
    expect(made).toBeLessThan(20);
    expect(names(db).length).toBe(made + 1);
    await start(file).check();
    expect(joined().length).toBe(20);
  });
});

describe("the cap of 5,000 realm rooms", () => {
  it("makes none more past the shipped cap, and logs one line saying how many it left, never one for each", async () => {
    const { db, events, joined, start } = setup();
    const add = db.prepare("INSERT INTO realm_rooms (name) VALUES (?)");
    for (let k = 0; k < 5_000 - 10; k += 1) add.run(`#w/x-${String(k)}`);
    await start(written(PATHS)).check();
    expect(joined().length).toBe(10);
    expect(events()).toEqual([`{"event":"rooms_ahead_full","value":${String(DISTINCT - 10)}}`]);
  });

  it("counts the hubs' main rooms in the cap, and logs when the cap stops the hubs too", async () => {
    const { joined, events, start } = setup({ realmMax: 2, hubs: HUBS });
    await start(written(PATHS.slice(0, 5))).check();
    expect(joined().length).toBe(2);
    expect(events().length).toBe(1);
    expect(events()[0]).toContain('"event":"rooms_ahead_full"');
  });

  it("logs nothing when the rooms fit exactly, and nothing again for an unchanged file at the cap", async () => {
    const { events, joined, start } = setup({ realmMax: 3 });
    const file = written(PATHS.slice(0, 3));
    const ahead = start(file);
    await ahead.check();
    expect(joined().length).toBe(3);
    expect(events()).toEqual([]);
    await ahead.check();
    expect(events()).toEqual([]);
    written(PATHS.slice(0, 5), 9_000, file);
    await ahead.check();
    expect(events().length).toBe(1);
    await ahead.check();
    expect(events().length).toBe(1);
  });
});

describe("passes that overlap", () => {
  it("starts no second pass while one waits: the second check makes no room and adds no wait, and the pace holds", async () => {
    const { joined, timeline, start, hold } = setup({ perSecond: 10 });
    const release = hold();
    const ahead = start(written(PATHS));
    const first = ahead.check();
    await vi.waitFor(() => {
      expect(timeline.waits.length).toBe(1);
    });
    expect(joined().length).toBe(10);
    // The second check returns the pass that waits: it starts nothing, so nothing is left to wait for.
    const second = ahead.check();
    expect(timeline.waits.length).toBe(1);
    expect(joined().length).toBe(10);
    release();
    await Promise.all([first, second]);
    expect(joined().length).toBe(DISTINCT);
    expect(burst(timeline)).toBeLessThanOrEqual(10);
  });

  it("logs the full cap once for two overlapping checks", async () => {
    const { events, timeline, start, hold } = setup({ perSecond: 2, realmMax: 5 });
    const release = hold();
    const ahead = start(written(PATHS.slice(0, 12)));
    const first = ahead.check();
    const second = ahead.check();
    await vi.waitFor(() => {
      expect(timeline.waits.length).toBe(1);
    });
    release();
    await Promise.all([first, second]);
    expect(events().length).toBe(1);
  });

  it("does nothing once stopped: no room, no wait", async () => {
    const { db, timeline, sent, start } = setup({ hubs: HUBS });
    const ahead = start(written(PATHS.slice(0, 5)));
    ahead.stop();
    await ahead.check();
    expect(names(db)).toEqual(["#earth"]);
    expect(sent).toEqual([]);
    expect(timeline.waits).toEqual([]);
  });
});

describe("a pass that did not finish", () => {
  it("is logged by its kind with no path, stops there, and is made again by the next check with the same file", async () => {
    const { rooms, joined } = setup();
    const lines: string[] = [];
    let calls = 0;
    const flaky: Rooms = {
      ...rooms,
      realm: (room) => {
        calls += 1;
        if (calls === 2) throw new RangeError("secret-detail-gno.land/r/other");
        return rooms.realm(room);
      },
    };
    const log = logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line));
    const file = written(["gno.land/r/leon", "gno.land/r/other", "gno.land/r/third"], 1_000);
    const ahead = aheadRooms({ file, rooms: flaky, hubs: [], log, wait: () => Promise.resolve() });
    await expect(ahead.check()).resolves.toBeUndefined();
    expect(joined()).toEqual(["JOIN #leon"]);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('"event":"rooms_ahead_failed","error":"RangeError"');
    expect(lines[0]).not.toContain("secret");
    expect(lines[0]).not.toContain("gno.land");
    // The file's time has not changed: the pass that did not finish is not taken for done.
    await ahead.check();
    expect(joined()).toEqual(["JOIN #leon", "JOIN #other", "JOIN #third"]);
    expect(lines.length).toBe(1);
  });

  it("is made again by a new start when it was stopped half way, with the same file", async () => {
    const { joined, start } = setup({ perSecond: 3 });
    const file = written(PATHS.slice(0, 10));
    const first = start(file, { stopAt: 1 });
    await first.check();
    expect(joined().length).toBeLessThan(10);
    const second = start(file);
    await second.check();
    expect(joined().length).toBe(new Set(PATHS.slice(0, 10).map((path) => realmRoom(path, []).room)).size);
  });
});

describe("which rooms the cap keeps", () => {
  it("makes the most-called realms' rooms when the cap is short, never the first by name: junk under an early namespace takes none", async () => {
    const { db, start } = setup({ realmMax: 3 });
    const junk = Array.from({ length: 10 }, (_, k) => `gno.land/r/aaa/junk${String(k)}`);
    const busy = ["gno.land/r/zzz/one", "gno.land/r/zzz/two", "gno.land/r/mmm/solo"];
    const calls = { "gno.land/r/zzz/one": 40, "gno.land/r/zzz/two": 60, "gno.land/r/mmm/solo": 30 };
    await start(called([...junk, ...busy], calls)).check();
    const made = names(db).filter((name) => name !== "#earth");
    expect(made.toSorted()).toEqual(busy.map((path) => realmRoom(path, []).room).toSorted());
  });

  it("takes the busiest world first: its total of calls, a world with none last", async () => {
    const { db, start } = setup({ realmMax: 2 });
    const paths = ["gno.land/r/aaa/x", "gno.land/r/mmm/x", "gno.land/r/zzz/x"];
    await start(called(paths, { "gno.land/r/mmm/x": 50, "gno.land/r/zzz/x": 100 })).check();
    const made = names(db).filter((name) => name !== "#earth");
    expect(made.toSorted()).toEqual([paths[1], paths[2]].map((path) => realmRoom(path ?? "", []).room).toSorted());
  });

  it("keeps the hubs' rooms before the busiest realm's (a guard: it held before this part)", async () => {
    const { db, start } = setup({ realmMax: HUBS.length, hubs: HUBS });
    await start(called(["gno.land/r/zzz/x"], { "gno.land/r/zzz/x": 99 })).check();
    expect(
      names(db)
        .filter((name) => name !== "#earth")
        .toSorted(),
    ).toEqual(HUBS.map(({ slug }) => `#${slug}`).toSorted());
  });
});

describe("how the worlds are ordered", () => {
  const roomsOf = (paths: readonly string[]): string[] => paths.map((path) => realmRoom(path, []).room).toSorted();

  it("orders worlds by their total of calls, not by their busiest realm or realm by realm: two realms of 30 beat one of 50", async () => {
    const { db, start } = setup({ realmMax: 2 });
    const a = ["gno.land/r/mmm/app_one", "gno.land/r/mmm/app_two"];
    const b = ["gno.land/r/zzz/solo"];
    await start(called([...b, ...a], { [a[0] ?? ""]: 30, [a[1] ?? ""]: 30, [b[0] ?? ""]: 50 })).check();
    expect(
      names(db)
        .filter((name) => name !== "#earth")
        .toSorted(),
    ).toEqual(roomsOf(a));
  });

  it("keeps the file's order among worlds with the same total, none counting as none", async () => {
    const { db, start } = setup({ realmMax: 2 });
    const paths = ["gno.land/r/zzz/x", "gno.land/r/aaa/x", "gno.land/r/mmm/x"];
    await start(written(paths)).check();
    expect(
      names(db)
        .filter((name) => name !== "#earth")
        .toSorted(),
    ).toEqual(roomsOf([paths[0] ?? "", paths[1] ?? ""]));
  });
});

describe("the work of a pass", () => {
  const rooms5 = PATHS.slice(0, 5);

  it("hashes only the paths it has not seen: a second file with one new path asks for one room name, not all", async () => {
    const { rooms } = setup();
    const asked: string[] = [];
    const roomOf: typeof realmRoom = (path, hubs) => {
      asked.push(path);
      return realmRoom(path, hubs);
    };
    const file = written(rooms5, 1_000);
    const ahead = aheadRooms({ file, rooms, hubs: [], log: () => undefined, wait: () => Promise.resolve(), roomOf });
    await ahead.check();
    expect(asked.length).toBe(5);
    written([...rooms5, "gno.land/r/leon"], 2_000, file);
    await ahead.check();
    expect(asked).toEqual([...rooms5, "gno.land/r/leon"]);
  });

  it("keeps the names it has seen in a map of a fixed size: with room for 2, a file of 2 paths read twice hashes 2 in all", async () => {
    const { rooms } = setup();
    let asked = 0;
    const roomOf: typeof realmRoom = (path, hubs) => {
      asked += 1;
      return realmRoom(path, hubs);
    };
    const file = written(rooms5.slice(0, 2), 1_000);
    const ahead = aheadRooms({
      file,
      rooms,
      hubs: [],
      log: () => undefined,
      wait: () => Promise.resolve(),
      roomOf,
      roomKeys: 2,
    });
    await ahead.check();
    written(rooms5.slice(0, 2), 2_000, file);
    await ahead.check();
    expect(asked).toBe(2);
  });

  it("past that size a path is hashed again: 5 paths with room for 2, read twice, hash more than 5 times", async () => {
    const { rooms } = setup();
    let asked = 0;
    const roomOf: typeof realmRoom = (path, hubs) => {
      asked += 1;
      return realmRoom(path, hubs);
    };
    const file = written(rooms5, 1_000);
    const ahead = aheadRooms({
      file,
      rooms,
      hubs: [],
      log: () => undefined,
      wait: () => Promise.resolve(),
      roomOf,
      roomKeys: 2,
    });
    await ahead.check();
    written(rooms5, 2_000, file);
    await ahead.check();
    expect(asked).toBeGreaterThan(5);
  });

  it("keeps the 743 onyx paths at the shipped size: a second pass over them hashes none", async () => {
    const { rooms } = setup({ realmMax: 100_000 });
    let asked = 0;
    const roomOf: typeof realmRoom = (path, hubs) => {
      asked += 1;
      return realmRoom(path, hubs);
    };
    const file = written(PATHS, 1_000);
    const ahead = aheadRooms({ file, rooms, hubs: [], log: () => undefined, wait: () => Promise.resolve(), roomOf });
    await ahead.check();
    expect(asked).toBe(743);
    written(PATHS, 2_000, file);
    await ahead.check();
    expect(asked).toBe(743);
  });

  it("stays bounded at the shipped size: a set far above it is hashed again by the next pass, not held whole", async () => {
    const { rooms } = setup();
    let asked = 0;
    const roomOf: typeof realmRoom = (path) => {
      asked += 1;
      return { world: "w", room: `#w/${path}` };
    };
    const paths = Array.from({ length: 150_000 }, (_, k) => `gno.land/r/w/p${String(k)}`);
    const stamp = { at: 1 };
    const listing = { known: () => true, paths: () => paths, stamp: () => stamp.at };
    const ahead = aheadRooms({
      file: "unused",
      rooms,
      hubs: [],
      log: () => undefined,
      wait: () => Promise.resolve(),
      roomOf,
      listing,
    });
    await ahead.check();
    expect(asked).toBe(150_000);
    stamp.at = 2;
    await ahead.check();
    expect(asked).toBeGreaterThan(150_000);
    expect(asked).toBeLessThan(300_000 + 1);
  }, 30_000);

  it("reads the file through a listing it shares: one read for the route's check and the pass's, again only after a change", async () => {
    const { rooms } = setup();
    const file = written(rooms5, 1_000);
    // What the shared read returns is not what is on disk: the pass must make the room of what the listing holds.
    const injected = readFileSync(written(["gno.land/r/injected"], 1_000), "utf8");
    let reads = 0;
    const listing = worldsListing(file, () => {
      reads += 1;
      return injected;
    });
    const ahead = aheadRooms({ file, rooms, hubs: [], log: () => undefined, wait: () => Promise.resolve(), listing });
    expect(listing.known("gno.land/r/injected")).toBe(true);
    await ahead.check();
    await ahead.check();
    expect(rooms.exists(realmRoom("gno.land/r/injected", []).room)).toBe(true);
    expect(rooms.exists(realmRoom(rooms5[0] ?? "", []).room)).toBe(false);
    expect(reads).toBe(1);
    written([...rooms5, "gno.land/r/leon"], 3_000, file);
    await ahead.check();
    expect(reads).toBe(2);
  });
});

describe("stopping while the pass waits", () => {
  const wait = (ms: number, signal?: AbortSignal): Promise<void> =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        resolve();
      });
    });

  it("gives its wait an abort signal, aborted by stop(), and leaves no timer behind", async () => {
    vi.useFakeTimers();
    try {
      const { rooms } = setup();
      const seen: (AbortSignal | undefined)[] = [];
      const lines: string[] = [];
      const ahead = aheadRooms({
        file: written(PATHS.slice(0, 25)),
        rooms,
        hubs: [],
        log: logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line)),
        wait: (ms, signal) => {
          seen.push(signal);
          return wait(ms, signal);
        },
        perSecond: 5,
      });
      const done = ahead.check();
      await vi.advanceTimersByTimeAsync(10);
      expect(vi.getTimerCount()).toBe(1);
      expect(seen[0]?.aborted).toBe(false);
      ahead.stop();
      expect(seen[0]?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      await done;
      expect(lines).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves no timer behind with the pace's own wait either, and its check ends", async () => {
    vi.useFakeTimers();
    try {
      const { rooms } = setup();
      const lines: string[] = [];
      const log = logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line));
      const ahead = aheadRooms({ file: written(PATHS.slice(0, 25)), rooms, hubs: [], log, perSecond: 5 });
      const done = ahead.check();
      await vi.advanceTimersByTimeAsync(10);
      expect(vi.getTimerCount()).toBe(1);
      ahead.stop();
      expect(vi.getTimerCount()).toBe(0);
      await done;
      // An aborted sleep must end quietly: no rooms_ahead_failed from an AbortError.
      expect(lines).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

// Moved here from realmRoom.test.ts: a test sits beside the file it tests.
describe("realmRoom over the onyx realm paths (D413)", () => {
  // The realm paths gno_packages lists on onyx (server/src/worlds/onyxPaths.txt).
  const PATHS = readFileSync(new URL("../worlds/onyxPaths.txt", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line.startsWith("gno.land/r/"));

  const HUBS = z
    .array(z.object({ slug: z.string(), realms: z.optional(z.array(z.string())) }))
    .parse(JSON.parse(readFileSync(new URL("../../../app/data/hubs.json", import.meta.url), "utf8")));

  describe("realmRoom over the onyx realm paths", () => {
    it("lists the 743 paths", () => {
      expect(PATHS.length).toBe(743);
    });

    it("gives each a valid RoomId of 64 characters at most, whose world is the one it names", () => {
      for (const path of PATHS) {
        const { world, room } = realmRoom(path, []);
        expect(RoomId.safeParse(room).success, path).toBe(true);
        expect(worldOf(room), path).toBe(world);
      }
    });

    it("gives no two paths one room unless one realm's versions share its main room", () => {
      const owners = new Map<string, string>();
      for (const path of PATHS) {
        const { room } = realmRoom(path, []);
        const stem = path.replace(/\/v[0-9]+$/, "");
        const seen = owners.get(room);
        if (seen !== undefined) expect(seen, `${path} and ${room}`).toBe(stem);
        owners.set(room, stem);
      }
    });

    it("gives no two worlds one slug", () => {
      const ids = new Map<string, string>();
      for (const path of PATHS) {
        const { world } = realmRoom(path, []);
        expect(ids.get(world) ?? worldIdOf(path), world).toBe(worldIdOf(path));
        ids.set(world, worldIdOf(path));
      }
    });

    it("keeps the same four promises with the shipped hubs, and gives no realm the Earth's general chat", () => {
      const rooms = new Map<string, string>();
      for (const path of PATHS) {
        const { world, room } = realmRoom(path, HUBS);
        expect(RoomId.safeParse(room).success, path).toBe(true);
        expect(worldOf(room), path).toBe(world);
        expect(room, path).not.toBe("#earth");
        const stem = path.replace(/\/v[0-9]+$/, "");
        expect(rooms.get(room) ?? stem, room).toBe(stem);
        rooms.set(room, stem);
      }
    });
  });
});
