import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { makeApp } from "../app.ts";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import { EARTH_TABLES, REALM_PATH, REALM_TABLES, ROOM_STATE, makeRooms } from "./create.ts";
import { ROOM_TABLES, ensureRooms, listRooms, realmPaths } from "./rooms.ts";
import { realmRoutes } from "./realmRoutes.ts";
import { roomsRoutes } from "./routes.ts";
import { realmRoom } from "@gnoworld/core";

const T0 = Date.parse("2026-11-07T12:00:00.000Z");
const HOUR = 60 * 60_000;
const ORIGIN = "https://gnoworld.test";
const KNOWN = new Set(["gno.land/r/leon", "gno.land/r/gov/dao", "gno.land/r/gnogolf/golf_a/v2"]);
const HUBS = [{ slug: "govdao", realms: ["gno.land/r/gov/dao"] }];

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

const setup = ({ realmMax, per }: { realmMax?: number; per?: number } = {}) => {
  const db = openDatabase(":memory:", [ROOM_TABLES, ROOM_STATE, REALM_TABLES, REALM_PATH, EARTH_TABLES]);
  opened.push(db);
  ensureRooms(db, ["earth"], T0);
  const clock = { now: T0 };
  const sent: string[] = [];
  const rooms = makeRooms({
    db,
    send: (command, params) => sent.push([command, ...params].join(" ")) > 0,
    now: () => clock.now,
    max: 20,
    ...(realmMax === undefined ? {} : { realmMax }),
  });
  const lines: string[] = [];
  const log = logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line));
  const app = makeApp(log, () => true);
  app.route(
    "/api/rooms/realm",
    realmRoutes({
      rooms,
      known: (path) => KNOWN.has(path) || /^gno\.land\/r\/many[0-9]+$/.test(path),
      hubs: HUBS,
      origins: [ORIGIN],
      log,
      now: () => clock.now,
      visitor: (c) => c.req.header("x-visitor") ?? "203.0.113.7",
      ...(per === undefined ? {} : { perVisitor: per }),
    }),
  );
  interface Ask {
    body?: unknown;
    origin?: string | null;
    type?: string | null;
    visitor?: string;
    cookie?: string;
  }
  const ask = ({ body, origin = ORIGIN, type = "application/json", visitor, cookie }: Ask) =>
    app.request("/api/rooms/realm", {
      method: "POST",
      headers: {
        ...(origin === null ? {} : { origin }),
        ...(type === null ? {} : { "content-type": type }),
        ...(visitor === undefined ? {} : { "x-visitor": visitor }),
        ...(cookie === undefined ? {} : { cookie }),
      },
      ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    });
  const events = () => lines.map((line) => line.replace(/^\{"time":"[^"]+",/, "{").trimEnd());
  return { db, clock, sent, ask, events };
};
const answer = async (response: Response) => [
  response.status,
  await response.text(),
  response.headers.get("cache-control"),
];

describe("POST /api/rooms/realm", () => {
  it("holds the shipped cap at 5,000 realm rooms", async () => {
    const { db, ask } = setup();
    const add = db.prepare("INSERT INTO realm_rooms (name) VALUES (?)");
    for (let n = 0; n < 4999; n += 1) add.run(`#w/x-${String(n)}`);
    expect((await ask({ body: { path: "gno.land/r/leon" } })).status).toBe(200);
    expect((await ask({ body: { path: "gno.land/r/gov/dao" } })).status).toBe(429);
  });

  it("makes a known realm's room for a visitor with no account, and answers it", async () => {
    const { db, sent, ask } = setup();
    const response = await ask({ body: { path: "gno.land/r/leon" } });
    expect(await answer(response)).toEqual([200, '{"room":"#leon"}', "no-store"]);
    expect(listRooms(db)).toContainEqual({ name: "#leon", world: "leon" });
    expect(sent).toEqual(["JOIN #leon", "SAMODE #leon +M", "SAMODE #leon -i"]);
  });

  it("records the realm in the room it makes, and gives a room made without one its path at the next ask", async () => {
    const { db, ask } = setup();
    await ask({ body: { path: "gno.land/r/leon" } });
    expect(realmPaths(db, "leon")).toEqual(new Map([["#leon", "gno.land/r/leon"]]));
    db.prepare("UPDATE realm_rooms SET path = NULL").run();
    await ask({ body: { path: "gno.land/r/leon" } });
    expect(realmPaths(db, "leon")).toEqual(new Map([["#leon", "gno.land/r/leon"]]));
  });

  it("tags a room made before the path was kept only from a listed path, never from a visitor's own", async () => {
    const { db, ask } = setup();
    await ask({ body: { path: "gno.land/r/leon" } });
    db.prepare("UPDATE realm_rooms SET path = NULL").run();
    // An unlisted version maps to the same root room, and proves nothing.
    await ask({ body: { path: "gno.land/r/leon/v999999" } });
    expect(realmPaths(db, "leon")).toEqual(new Map());
  });

  it("names a realm of a hub's world under the hub's slug, and another realm by its tail and hash", async () => {
    const { ask } = setup();
    expect((await answer(await ask({ body: { path: "gno.land/r/gov/dao" } })))[1]).toBe('{"room":"#govdao"}');
    const golf = await (await ask({ body: { path: "gno.land/r/gnogolf/golf_a/v2" } })).text();
    expect(golf).toMatch(/^\{"room":"#gnogolf-golf-e00c30567c\/golf-a-[0-9a-f]{10}"\}$/);
  });

  it("answers a room that exists with the same room, makes nothing, takes none of the visitor's hourly asks", async () => {
    const { sent, ask } = setup({ per: 1 });
    const first = await answer(await ask({ body: { path: "gno.land/r/leon" } }));
    for (let n = 0; n < 5; n += 1)
      expect(await answer(await ask({ body: { path: "gno.land/r/leon" } }))).toEqual(first);
    expect(sent.filter((line) => line.startsWith("JOIN"))).toEqual(["JOIN #leon"]);
  });

  it("refuses a path no worlds file lists with a 404, and makes no room", async () => {
    const { db, sent, ask, events } = setup();
    const response = await ask({ body: { path: "gno.land/r/nobody/there" } });
    expect(await answer(response)).toEqual([404, '{"error":"not_found"}', "no-store"]);
    expect(listRooms(db).map(({ name }) => name)).toEqual(["#earth"]);
    expect(sent).toEqual([]);
    expect(events()).toEqual(['{"event":"room_refused","route":"/api/rooms/realm","status":404,"error":"not_found"}']);
  });

  it("refuses a body that is no realm path, has another key, or is no JSON, and a path that is not a realm's", async () => {
    const { sent, ask } = setup();
    const bodies: unknown[] = [
      {},
      { path: 3 },
      { path: "gno.land/p/demo/avl" },
      { path: "gno.land/r/leon", extra: 1 },
      { path: `gno.land/r/${"a".repeat(300)}` },
      "not json",
    ];
    for (const body of bodies)
      expect(await answer(await ask({ body }))).toEqual([400, '{"error":"refused"}', "no-store"]);
    expect(sent).toEqual([]);
  });

  it("refuses a request from no listed Origin, or not in JSON, before reading anything", async () => {
    const { sent, ask } = setup();
    const body = { path: "gno.land/r/leon" };
    expect((await ask({ body, origin: "https://evil.test" })).status).toBe(403);
    expect((await ask({ body, origin: null })).status).toBe(403);
    expect((await ask({ body, type: "text/plain" })).status).toBe(415);
    expect((await ask({ body, type: null })).status).toBe(415);
    expect(sent).toEqual([]);
  });

  it("lets a visitor make 20 rooms an hour, then answers 429, while rooms it has asked for still answer", async () => {
    const { clock, ask } = setup({ per: 2 });
    const make = (path: string, visitor = "198.51.100.1") => ask({ body: { path }, visitor });
    expect((await make("gno.land/r/leon")).status).toBe(200);
    expect((await make("gno.land/r/gov/dao")).status).toBe(200);
    expect(await answer(await make("gno.land/r/gnogolf/golf_a/v2"))).toEqual([429, '{"error":"too_many"}', "no-store"]);
    expect((await make("gno.land/r/leon")).status).toBe(200);
    expect((await make("gno.land/r/gnogolf/golf_a/v2", "198.51.100.2")).status).toBe(200);
    clock.now += HOUR;
    expect((await make("gno.land/r/gov/dao")).status).toBe(200);
  });

  it("holds the shipped rate at 20 rooms an hour a visitor", async () => {
    const { ask } = setup();
    for (let n = 1; n <= 20; n += 1)
      expect((await ask({ body: { path: `gno.land/r/many${String(n)}` } })).status).toBe(200);
    expect((await ask({ body: { path: "gno.land/r/many21" } })).status).toBe(429);
  });

  it("opens the window again at the hour exactly, and not a millisecond before", async () => {
    const { clock, ask } = setup({ per: 1 });
    expect((await ask({ body: { path: "gno.land/r/leon" } })).status).toBe(200);
    clock.now += HOUR - 1;
    expect((await ask({ body: { path: "gno.land/r/gov/dao" } })).status).toBe(429);
    clock.now += 1;
    expect((await ask({ body: { path: "gno.land/r/gov/dao" } })).status).toBe(200);
  });

  it("takes nothing of a visitor's rate for a path that is unknown or a room that is full", async () => {
    const { ask } = setup({ per: 1, realmMax: 1 });
    for (let n = 0; n < 100; n += 1)
      expect((await ask({ body: { path: `gno.land/r/nobody${String(n)}` } })).status).toBe(404);
    expect((await ask({ body: { path: "gno.land/r/leon" } })).status).toBe(200);
    expect((await ask({ body: { path: "gno.land/r/gov/dao" } })).status).toBe(429);
  });

  it("makes no room for a GET, and refuses a bad Origin before reading a bad body", async () => {
    const { db, ask } = setup();
    expect((await ask({ body: "not json", origin: "https://evil.test" })).status).toBe(403);
    expect(listRooms(db).map(({ name }) => name)).toEqual(["#earth"]);
  });

  it("answers 429 once the realm rooms have their cap, and still answers a room that exists", async () => {
    const { ask } = setup({ realmMax: 1 });
    expect((await ask({ body: { path: "gno.land/r/leon" } })).status).toBe(200);
    expect(await answer(await ask({ body: { path: "gno.land/r/gov/dao" } }))).toEqual([
      429,
      '{"error":"too_many"}',
      "no-store",
    ]);
    expect((await ask({ body: { path: "gno.land/r/leon" } })).status).toBe(200);
  });

  it("ignores a session cookie: a room is made the same for an account and for none", async () => {
    const { ask } = setup();
    expect(await answer(await ask({ body: { path: "gno.land/r/leon" }, cookie: "__Host-session=whatever" }))).toEqual([
      200,
      '{"room":"#leon"}',
      "no-store",
    ]);
  });

  it("logs a room made by its name alone, no visitor and no path", async () => {
    const { ask, events } = setup();
    await ask({ body: { path: "gno.land/r/leon" }, visitor: "198.51.100.9" });
    expect(events()).toEqual(['{"event":"room_made","room":"#leon"}']);
  });

  it("answers beside the moderators' routes, mounted after it under /api/rooms, as the process mounts it", async () => {
    const { db } = setup();
    const log = logger("a-pepper-of-forty-characters-0123456789", () => undefined);
    const rooms = makeRooms({ db, send: () => true, now: () => T0, max: 20 });
    const app = makeApp(log, () => true);
    const options = { rooms, known: () => true, hubs: [], origins: [ORIGIN], log, now: () => T0, visitor: () => "x" };
    app.route("/api/rooms/realm", realmRoutes(options));
    app.route(
      "/api/rooms",
      roomsRoutes({
        ...options,
        roles: { team: new Set(), trusted: new Set(), worlds: new Map() },
        session: () => undefined,
      }),
    );
    const response = await app.request("/api/rooms/realm", {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ path: "gno.land/r/leon" }),
    });
    expect([response.status, await response.text()]).toEqual([200, '{"room":"#leon"}']);
  });
});

// Moved here from realmRoutes.chain.test.ts: a test sits beside the file it tests.
describe("realm rooms asked on the chain (D413)", () => {
  // D413: a path the worlds job does not list gets its room on its first open if it is on the chain; a listed realm's room is made ahead,
  // so its page's ask is answered with no work.
  const T0 = Date.parse("2026-11-08T12:00:00.000Z");
  const HOUR = 60 * 60_000;
  const ORIGIN = "https://gnoworld.test";
  const LISTED = new Set(["gno.land/r/leon", "gno.land/r/gov/dao", "gno.land/r/other/listed"]);
  const SYSTEM = "gno.land/r/sys/namereg/v0";
  const ELSEWHERE = new Set([SYSTEM, "gno.land/r/sys/users/v1", "gno.land/r/sys/params", "gno.land/r/sys/names"]);

  const opened: DatabaseSync[] = [];
  afterEach(() => {
    for (const db of opened.splice(0)) db.close();
  });

  type Reading = "yes" | "no" | "down";
  interface Knobs {
    per?: number;
    reads?: number;
    realmMax?: number;
    inFlight?: number;
    perHour?: number;
    missingKeys?: number;
    reserve?: number;
  }
  const setup = ({ per, reads, realmMax, inFlight, perHour, missingKeys, reserve }: Knobs = {}) => {
    const db = openDatabase(":memory:", [ROOM_TABLES, ROOM_STATE, REALM_TABLES, REALM_PATH, EARTH_TABLES]);
    opened.push(db);
    ensureRooms(db, ["earth"], T0);
    const clock = { now: T0 };
    const sent: string[] = [];
    const rooms = makeRooms({
      db,
      send: (command, params) => sent.push([command, ...params].join(" ")) > 0,
      now: () => clock.now,
      max: 20,
      ...(realmMax === undefined ? {} : { realmMax }),
    });
    const read: string[] = [];
    const chain = {
      answer: (path: string): Reading => (ELSEWHERE.has(path) || path.startsWith("gno.land/r/y/") ? "yes" : "no"),
    };
    // The chain's answers wait here until a test releases them, so asks can be in flight together.
    const gate = { wait: Promise.resolve() };
    const hold = (): (() => void) => {
      let release = (): void => undefined;
      gate.wait = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    };
    const lines: string[] = [];
    const log = logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line));
    const app = makeApp(log, () => true);
    app.route(
      "/api/rooms/realm",
      realmRoutes({
        rooms,
        known: (path) => LISTED.has(path),
        onChain: async (path) => {
          read.push(path);
          await gate.wait;
          return chain.answer(path);
        },
        hubs: [{ slug: "govdao", realms: ["gno.land/r/gov/dao"] }],
        origins: [ORIGIN],
        log,
        now: () => clock.now,
        visitor: (c) => c.req.header("x-visitor") ?? "203.0.113.7",
        ...(per === undefined ? {} : { perVisitor: per }),
        ...(reads === undefined ? {} : { perVisitorReads: reads }),
        ...(inFlight === undefined ? {} : { readsInFlight: inFlight }),
        ...(perHour === undefined ? {} : { readsPerHour: perHour }),
        ...(missingKeys === undefined ? {} : { missingKeys }),
        ...(reserve === undefined ? {} : { realmReserve: reserve }),
      }),
    );
    const ask = (path: string, visitor?: string, origin: string | null = ORIGIN) =>
      Promise.resolve(
        app.request("/api/rooms/realm", {
          method: "POST",
          headers: {
            ...(origin === null ? {} : { origin }),
            "content-type": "application/json",
            ...(visitor === undefined ? {} : { "x-visitor": visitor }),
          },
          body: JSON.stringify({ path }),
        }),
      );
    const raw = (body: string, type: string | null = "application/json") =>
      app.request("/api/rooms/realm", {
        method: "POST",
        headers: { origin: ORIGIN, ...(type === null ? {} : { "content-type": type }) },
        body,
      });
    const events = () => lines.map((line) => line.replace(/^\{"time":"[^"]+",/, "{").trimEnd());
    return { db, rooms, clock, sent, read, chain, ask, raw, hold, events };
  };
  const roomOf = (path: string): string => realmRoom(path, [{ slug: "govdao", realms: ["gno.land/r/gov/dao"] }]).room;
  const answer = async (response: Response) => [response.status, await response.text()];

  describe("POST /api/rooms/realm for a realm the worlds job lists", () => {
    it("answers a room made ahead with no chain read, no rate taken and no command sent, as often as it is asked", async () => {
      const { rooms, sent, read, ask } = setup({ per: 1, reads: 1 });
      rooms.realm("#leon");
      sent.length = 0;
      for (let k = 0; k < 5; k += 1)
        expect(await answer(await ask("gno.land/r/leon"))).toEqual([200, '{"room":"#leon"}']);
      expect(read).toEqual([]);
      expect(sent).toEqual([]);
      // The rate is whole: the visitor's one room of the hour is still to make.
      expect((await ask(SYSTEM)).status).toBe(200);
    });

    it("still makes a listed realm's room the job has not made yet, with no chain read", async () => {
      const { db, sent, read, ask } = setup();
      expect(await answer(await ask("gno.land/r/leon"))).toEqual([200, '{"room":"#leon"}']);
      expect(read).toEqual([]);
      expect(sent).toEqual(["JOIN #leon", "SAMODE #leon +M", "SAMODE #leon -i"]);
      expect(listRooms(db).map(({ name }) => name)).toContain("#leon");
    });
  });

  describe("POST /api/rooms/realm for a path the job does not list", () => {
    it("makes its room on its first open when the chain holds it, then answers the same room with no chain read", async () => {
      const { db, sent, read, ask } = setup();
      const room = roomOf(SYSTEM);
      expect(await answer(await ask(SYSTEM))).toEqual([200, `{"room":"${room}"}`]);
      expect(read).toEqual([SYSTEM]);
      expect(sent).toEqual([`JOIN ${room}`, `SAMODE ${room} +M`, `SAMODE ${room} -i`]);
      expect(listRooms(db).map(({ name }) => name)).toContain(room);
      expect(await answer(await ask(SYSTEM, "198.51.100.9"))).toEqual([200, `{"room":"${room}"}`]);
      expect(read).toEqual([SYSTEM]);
      expect(sent.length).toBe(3);
    });

    it("makes no room for a path the chain does not hold: 404 not_found, a name logged nowhere, and no room rate taken", async () => {
      const { db, sent, read, ask, events } = setup({ per: 1 });
      for (const path of ["gno.land/r/nobody/there", "gno.land/r/nobody/other", "gno.land/r/nobody/third"])
        expect(await answer(await ask(path))).toEqual([404, '{"error":"not_found"}']);
      expect(read.length).toBe(3);
      expect(sent).toEqual([]);
      expect(listRooms(db).map(({ name }) => name)).toEqual(["#earth"]);
      expect(events().join("\n")).not.toContain("nobody");
      expect((await ask(SYSTEM)).status).toBe(200);
    });

    it("answers 503 not_ready, makes no room and takes no rate while the chain does not answer, and asks it again later", async () => {
      const { sent, chain, read, ask } = setup({ per: 1 });
      chain.answer = () => "down";
      expect(await answer(await ask(SYSTEM))).toEqual([503, '{"error":"not_ready"}']);
      expect(sent).toEqual([]);
      chain.answer = (path) => (path === SYSTEM ? "yes" : "no");
      expect((await ask(SYSTEM)).status).toBe(200);
      expect(read).toEqual([SYSTEM, SYSTEM]);
    });

    it("takes the visitor's hourly room rate, and refuses 429 before any chain read once it is used", async () => {
      const { clock, read, ask } = setup({ per: 1 });
      expect((await ask(SYSTEM)).status).toBe(200);
      expect(await answer(await ask("gno.land/r/sys/users/v1"))).toEqual([429, '{"error":"too_many"}']);
      expect(read).toEqual([SYSTEM]);
      expect((await ask("gno.land/r/sys/users/v1", "198.51.100.2")).status).toBe(200);
      clock.now += HOUR;
      expect((await ask("gno.land/r/sys/users/v1")).status).toBe(200);
    });

    it("holds the realm rooms' cap: 429 for a room past it, an existing room still answered", async () => {
      const { ask, db, read } = setup({ realmMax: 1, reserve: 0 });
      expect((await ask(SYSTEM)).status).toBe(200);
      expect(await answer(await ask("gno.land/r/sys/users/v1"))).toEqual([429, '{"error":"too_many"}']);
      expect((await ask(SYSTEM)).status).toBe(200);
      // The cap is looked at before the chain is asked: a full cap costs the chain nothing.
      expect(read).toEqual([SYSTEM]);
      expect(listRooms(db).length).toBe(2);
    });

    it("bounds the chain reads a visitor causes an hour: the next unlisted path gets 429 with no read, the window opens at the hour", async () => {
      const { clock, read, ask } = setup({ reads: 2 });
      for (const path of ["gno.land/r/n/a", "gno.land/r/n/b"])
        expect((await ask(path, "198.51.100.1")).status).toBe(404);
      expect(await answer(await ask("gno.land/r/n/c", "198.51.100.1"))).toEqual([429, '{"error":"too_many"}']);
      expect(read.length).toBe(2);
      expect((await ask("gno.land/r/n/c", "198.51.100.2")).status).toBe(404);
      clock.now += HOUR;
      expect((await ask("gno.land/r/n/c", "198.51.100.1")).status).toBe(404);
    });

    it("holds the shipped bound at 5 chain reads an hour a visitor", async () => {
      const { read, ask } = setup();
      for (let k = 1; k <= 5; k += 1) expect((await ask(`gno.land/r/n/p${String(k)}`)).status).toBe(404);
      expect((await ask("gno.land/r/n/p6")).status).toBe(429);
      expect(read.length).toBe(5);
    });

    it("does not read the chain again for a path it just found missing, from anyone, until an hour has passed", async () => {
      const { clock, read, ask } = setup();
      for (const visitor of ["198.51.100.1", "198.51.100.2", "198.51.100.3"])
        expect((await ask("gno.land/r/n/missing", visitor)).status).toBe(404);
      expect(read).toEqual(["gno.land/r/n/missing"]);
      clock.now += HOUR;
      await ask("gno.land/r/n/missing");
      expect(read.length).toBe(2);
    });

    it("reads the chain for nothing before the Origin, the JSON and the body are good, then reads once for a good ask", async () => {
      const { read, ask, raw } = setup();
      expect((await ask(SYSTEM, undefined, "https://evil.test")).status).toBe(403);
      expect((await ask(SYSTEM, undefined, null)).status).toBe(403);
      expect((await ask("gno.land/p/demo/avl")).status).toBe(400);
      expect((await ask(`gno.land/r/${"a".repeat(300)}`)).status).toBe(400);
      expect((await raw(JSON.stringify({ path: SYSTEM }), "text/plain")).status).toBe(415);
      expect((await raw(JSON.stringify({ path: SYSTEM, extra: 1 }))).status).toBe(400);
      expect(read).toEqual([]);
      expect((await ask(SYSTEM)).status).toBe(200);
      expect(read).toEqual([SYSTEM]);
    });

    it("keeps a path found missing as missing for an hour, not for good: a realm deployed since is found at the hour", async () => {
      const { clock, chain, ask } = setup();
      chain.answer = () => "no";
      expect((await ask("gno.land/r/sys/new/v1")).status).toBe(404);
      chain.answer = () => "yes";
      expect((await ask("gno.land/r/sys/new/v1")).status).toBe(404);
      clock.now += HOUR;
      expect((await ask("gno.land/r/sys/new/v1")).status).toBe(200);
    });

    it("logs no path for a refusal that is a 429 or a 503", async () => {
      const { chain, ask, events } = setup({ reads: 1 });
      chain.answer = () => "down";
      expect((await ask("gno.land/r/sys/secretpath")).status).toBe(503);
      expect((await ask("gno.land/r/sys/secretpath2")).status).toBe(429);
      expect(events().join("\n")).not.toContain("secretpath");
    });

    it("answers 503 not_ready, not a 500, when the chain read itself rejects", async () => {
      const { chain, sent, ask } = setup();
      chain.answer = () => {
        throw new Error("boom");
      };
      expect(await answer(await ask(SYSTEM))).toEqual([503, '{"error":"not_ready"}']);
      expect(sent).toEqual([]);
    });
  });

  // The spend is before the first await: asks in flight together are counted as they start, not as they end (ARCHITECTURE.md, the login's rule).
  describe("POST /api/rooms/realm under asks in flight together", () => {
    const yes = (k: number): string => `gno.land/r/y/p${String(k)}`;
    const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));
    const statuses = async (asks: Promise<Response>[]) => (await Promise.all(asks)).map((response) => response.status);

    it("lets one visitor's 10 simultaneous asks for 10 paths on the chain make at most 2 rooms and read at most 3 times", async () => {
      const { sent, read, ask, hold } = setup({ per: 2, reads: 3 });
      const release = hold();
      const asks = Array.from({ length: 10 }, (_, k) => ask(yes(k)));
      await tick();
      release();
      const codes = await statuses(asks);
      expect(read.length).toBeLessThanOrEqual(3);
      expect(sent.filter((line) => line.startsWith("JOIN ")).length).toBeLessThanOrEqual(2);
      expect(codes.filter((code) => code === 200).length).toBe(2);
      expect(codes.filter((code) => code === 429).length).toBe(8);
    });

    it("reads once for one visitor's 10 simultaneous asks for one missing path, all answered 404", async () => {
      const { read, ask, hold } = setup({ reads: 1 });
      const release = hold();
      const asks = Array.from({ length: 10 }, () => ask("gno.land/r/n/same"));
      await tick();
      release();
      expect(await statuses(asks)).toEqual(Array.from({ length: 10 }, () => 404));
      expect(read).toEqual(["gno.land/r/n/same"]);
    });

    it("reads once for 10 visitors' simultaneous asks for one missing path (single flight), and makes one room for a path on the chain", async () => {
      const { read, sent, ask, hold } = setup();
      const release = hold();
      const asks = Array.from({ length: 10 }, (_, k) => ask("gno.land/r/n/same", `198.51.100.${String(k + 1)}`));
      const found = Array.from({ length: 10 }, (_, k) => ask(SYSTEM, `198.51.101.${String(k + 1)}`));
      await tick();
      release();
      expect(await statuses(asks)).toEqual(Array.from({ length: 10 }, () => 404));
      expect(await statuses(found)).toEqual(Array.from({ length: 10 }, () => 200));
      expect(read.toSorted()).toEqual(["gno.land/r/n/same", SYSTEM].toSorted());
      expect(sent.filter((line) => line.startsWith("JOIN ")).length).toBe(1);
    });

    it("holds the reads in flight at once to the knob (4 here): the others are refused 429 with no read, and the room opens again after", async () => {
      const { read, ask, hold } = setup({ inFlight: 4 });
      const release = hold();
      const asks = Array.from({ length: 10 }, (_, k) =>
        ask(`gno.land/r/n/p${String(k)}`, `198.51.100.${String(k + 1)}`),
      );
      await tick();
      expect(read.length).toBe(4);
      release();
      const codes = await statuses(asks);
      expect(codes.filter((code) => code === 404).length).toBe(4);
      expect(codes.filter((code) => code === 429).length).toBe(6);
      expect(read.length).toBe(4);
      expect((await ask("gno.land/r/n/later", "198.51.100.99")).status).toBe(404);
      expect(read.length).toBe(5);
    });

    it("holds the shipped reads in flight at 4", async () => {
      const { read, ask, hold } = setup();
      const release = hold();
      const asks = Array.from({ length: 8 }, (_, k) =>
        ask(`gno.land/r/n/p${String(k)}`, `198.51.100.${String(k + 1)}`),
      );
      await tick();
      expect(read.length).toBe(4);
      release();
      await statuses(asks);
    });

    it("holds all visitors' chain reads to a number an hour, whoever asks, and opens the window at the hour", async () => {
      const { clock, read, ask } = setup({ perHour: 3 });
      for (let k = 1; k <= 3; k += 1)
        expect((await ask(`gno.land/r/n/p${String(k)}`, `198.51.100.${String(k)}`)).status).toBe(404);
      expect((await ask("gno.land/r/n/p4", "198.51.100.4")).status).toBe(429);
      expect(read.length).toBe(3);
      clock.now += HOUR;
      expect((await ask("gno.land/r/n/p4", "198.51.100.4")).status).toBe(404);
    });

    it("counts a chain that answered down against the visitor's reads", async () => {
      const { chain, read, ask } = setup({ reads: 2 });
      chain.answer = () => "down";
      expect((await ask("gno.land/r/n/a")).status).toBe(503);
      expect((await ask("gno.land/r/n/b")).status).toBe(503);
      expect((await ask("gno.land/r/n/c")).status).toBe(429);
      expect(read.length).toBe(2);
    });
  });

  describe("the memory of paths found missing", () => {
    it("holds a number of paths at most: past it the one set longest ago is read again, the latest is not", async () => {
      const { read, ask } = setup({ missingKeys: 3, reads: 100 });
      for (let k = 1; k <= 5; k += 1) await ask(`gno.land/r/n/p${String(k)}`);
      expect(read.length).toBe(5);
      await ask("gno.land/r/n/p5");
      expect(read.length).toBe(5);
      await ask("gno.land/r/n/p1");
      expect(read.length).toBe(6);
    });

    it("keeps a path 59 minutes 59.999 seconds, and reads it again at exactly one hour", async () => {
      const { clock, read, ask } = setup();
      await ask("gno.land/r/n/edge");
      clock.now += HOUR - 1;
      await ask("gno.land/r/n/edge");
      expect(read.length).toBe(1);
      clock.now += 1;
      await ask("gno.land/r/n/edge");
      expect(read.length).toBe(2);
    });

    it("holds the shipped memory to a bounded number of paths", async () => {
      const { read, ask } = setup({ reads: 100_000, perHour: 100_000, inFlight: 100 });
      for (let k = 0; k < 1_100; k += 1) await ask(`gno.land/r/n/p${String(k)}`, `198.51.100.${String(k % 250)}`);
      await ask("gno.land/r/n/p0");
      expect(read.length).toBe(1_101);
    });
  });

  describe("the realm rooms kept for the rooms made ahead", () => {
    const yes = (k: number): string => `gno.land/r/y/p${String(k)}`;

    it("stops an unlisted path at the reserve: the cap less the reserve, 429 with no chain read, while the ahead pass still fills the cap", async () => {
      const { rooms, read, ask } = setup({ realmMax: 5, reserve: 2 });
      const codes: number[] = [];
      for (let k = 0; k < 5; k += 1) codes.push((await ask(yes(k), `198.51.100.${String(k + 1)}`)).status);
      expect(codes).toEqual([200, 200, 200, 429, 429]);
      expect(read.length).toBe(3);
      expect(rooms.realm("#ahead-one")).toEqual({ made: "#ahead-one" });
      expect(rooms.realm("#ahead-two")).toEqual({ made: "#ahead-two" });
      expect(rooms.realm("#ahead-three")).toBe("full");
    });

    it("holds the shipped reserve at 1,000 of the 5,000: a visitor's room stops at 4,000", async () => {
      const { db, ask } = setup();
      const add = db.prepare("INSERT INTO realm_rooms (name) VALUES (?)");
      for (let k = 0; k < 3_999; k += 1) add.run(`#w/x-${String(k)}`);
      expect((await ask(yes(1))).status).toBe(200);
      expect((await ask(yes(2), "198.51.100.2")).status).toBe(429);
    });

    it("does not hold a listed realm to the reserve: a listed path's room is made up to the full cap", async () => {
      const { ask } = setup({ realmMax: 3, reserve: 2 });
      expect((await ask("gno.land/r/leon")).status).toBe(200);
      expect((await ask("gno.land/r/gov/dao")).status).toBe(200);
      expect((await ask(yes(1))).status).toBe(429);
    });

    it("still holds a listed realm to the full cap: at 3 of 3 its room to make is refused 429", async () => {
      const { rooms, ask } = setup({ realmMax: 3, reserve: 2 });
      expect((await ask("gno.land/r/leon")).status).toBe(200);
      expect((await ask("gno.land/r/gov/dao")).status).toBe(200);
      rooms.realm("#filler");
      expect((await ask("gno.land/r/other/listed")).status).toBe(429);
    });

    it("holds the reserve at the spend too: asks in flight together cannot pass it", async () => {
      const { rooms, ask, hold } = setup({ realmMax: 5, reserve: 2 });
      rooms.realm("#pre-one");
      rooms.realm("#pre-two");
      const release = hold();
      const asks = [0, 1, 2].map((k) => ask(yes(k), `198.51.100.${String(k + 1)}`));
      await new Promise((resolve) => setTimeout(resolve, 20));
      release();
      const codes = (await Promise.all(asks)).map((response) => response.status).toSorted();
      expect(codes).toEqual([200, 429, 429]);
      expect(rooms.realm("#ahead-three")).toEqual({ made: "#ahead-three" });
    });
  });
});
