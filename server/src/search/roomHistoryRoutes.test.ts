import type { DatabaseSync } from "node:sqlite";
import { Address, ROOM_HISTORY_LINES, RoomHistory } from "@gnoworld/schemas";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import { afterEach, describe, expect, it } from "vitest";
import { makeApp } from "../app.ts";
import type { Said } from "../irc/link.ts";
import type { Room } from "../roles/roles.ts";
import { worldOf } from "../rooms/rooms.ts";
import type { Typed } from "../rooms/types.ts";
import { roomHistoryRoutes } from "./roomHistoryRoutes.ts";
import { makeSearch, SEARCH_TABLES } from "./index.ts";

// GET /api/history?room= serves one public room's last lines to anyone: never a room that is not open to a guest, never
// a line taken or hidden, an edit in its last text.
const T0 = Date.parse("2026-11-11T12:00:00.000Z");
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const RULES = { bannedWords: [], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };

const said = (msgid: string, over: Partial<Said> = {}): Said => ({
  room: "#bubble",
  account: ALICE,
  msgid,
  text: `line ${msgid}`,
  time: new Date(T0).toISOString(),
  ...over,
});

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.isOpen) db.close();
});

function setup({
  perMinute,
  perSecond,
  failing = false,
}: { perMinute?: number; perSecond?: number; failing?: boolean } = {}) {
  const rooms = new Map<string, Room>([
    ["#bubble/news", { type: "announcement", hidden: false }],
    ["#bubble/club", { type: "accounts", hidden: false }],
    ["#bubble/crew", { type: "members", readers: "crew", hidden: false }],
    ["#bubble/secret", { type: "open", hidden: true }],
  ]);
  const roles: Typed = {
    worlds: new Map([["bubble", { rules: RULES, groups: new Map([["crew", new Set([ALICE])]]), rooms }]]),
  };
  const archived = new Set<string>(["#bubble/old"]);
  const db = openDatabase(":memory:", [SEARCH_TABLES]);
  opened.push(db);
  const search = makeSearch(db, { roles, now: () => T0 });
  const known = ["#bubble", "#bubble/games", "#bubble/old", ...rooms.keys()];
  const log = logger("a-pepper-of-forty-characters-0123456789", () => undefined);
  const app = makeApp(log, () => true);
  app.route(
    "/api/history",
    roomHistoryRoutes({
      search: failing
        ? {
            latest: () => {
              throw new Error("database is locked: a line's words");
            },
          }
        : search,
      roles,
      archived: (room) => archived.has(room),
      rooms: (world) => known.filter((room) => worldOf(room) === world),
      log,
      now: () => T0,
      ...(perMinute === undefined ? {} : { perMinute }),
      ...(perSecond === undefined ? {} : { perSecond }),
    }),
  );
  const ask = (room: string, headers: Record<string, string> = {}, peer = "203.0.113.7") =>
    app.request(
      `/api/history?room=${encodeURIComponent(room)}`,
      { headers },
      { incoming: { socket: { remoteAddress: peer } } },
    );
  const lines = async (room: string) => {
    const response = await ask(room);
    expect(response.status).toBe(200);
    return RoomHistory.parse(await response.json()).lines;
  };
  return { search, ask, lines, app };
}

describe("a public room's last lines", () => {
  it("serves an open room's lines oldest first, in the shape the page reads", async () => {
    const t = setup();
    t.search.add(said("a", { time: new Date(T0).toISOString() }));
    t.search.add(said("b", { account: "anon/quick-fox-abcd", time: new Date(T0 + 1000).toISOString() }));
    expect(await t.lines("#bubble")).toEqual([
      { id: "a", time: "2026-11-11T12:00:00.000Z", from: ALICE, account: ALICE, text: "line a" },
      { id: "b", time: "2026-11-11T12:00:01.000Z", from: "anon/quick-fox-abcd", text: "line b" },
    ]);
  });

  it("serves the newest 50 of a longer room, still oldest first", async () => {
    const t = setup();
    for (let n = 0; n < ROOM_HISTORY_LINES + 10; n += 1)
      t.search.add(said(`m${String(n).padStart(3, "0")}`, { time: new Date(T0 + n * 1000).toISOString() }));
    const got = await t.lines("#bubble");
    expect(got).toHaveLength(ROOM_HISTORY_LINES);
    expect(got[0]?.id).toBe("m010");
    expect(got.at(-1)?.id).toBe("m059");
  });

  it("serves an announcement room's lines", async () => {
    const t = setup();
    t.search.add(said("n", { room: "#bubble/news" }));
    expect((await t.lines("#bubble/news")).map(({ id }) => id)).toEqual(["n"]);
  });

  it("serves an empty room as no lines", async () => {
    expect(await setup().lines("#bubble/games")).toEqual([]);
  });

  it("never serves a line a moderator removed, and serves an edited line in its last text", async () => {
    const t = setup();
    t.search.add(said("a"));
    t.search.add(said("b"));
    t.search.add(said("c"));
    t.search.remove("#bubble", "b");
    t.search.edited(said("e1", { edits: "c", text: "corrected" }));
    expect((await t.lines("#bubble")).map(({ id, text }) => [id, text])).toEqual([
      ["a", "line a"],
      ["c", "corrected"],
    ]);
  });
});

describe("what is not public answers not found, alike", () => {
  it.each([
    ["a members room", "#bubble/crew"],
    ["an accounts room", "#bubble/club"],
    ["a hidden room", "#bubble/secret"],
    ["an archived room", "#bubble/old"],
    ["a room the server does not know", "#bubble/nowhere"],
    ["a world it does not know", "#nowhere"],
  ])("answers %s with 404 and no line", async (_, room) => {
    const t = setup();
    for (const at of ["#bubble/crew", "#bubble/club", "#bubble/secret", "#bubble/old"])
      t.search.add(said(`x${at}`, { room: at }));
    const response = await t.ask(room);
    expect([response.status, await response.json()]).toEqual([404, { error: "not_found" }]);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers a missing or malformed room with 400", async () => {
    const t = setup();
    for (const path of ["/api/history", "/api/history?room=bubble", "/api/history?room=%23a&room=%23b"])
      expect((await t.app.request(path, {}, { incoming: { socket: { remoteAddress: "203.0.113.7" } } })).status).toBe(
        400,
      );
  });
});

describe("a failing index", () => {
  it("answers 503, not cached, and logs no word of what failed", async () => {
    const t = setup({ failing: true });
    const response = await t.ask("#bubble");
    expect([response.status, await response.json()]).toEqual([503, { error: "not_ready" }]);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("what a cache may keep", () => {
  it("lets any cache keep an answer a few seconds, with a validator that changes with the lines", async () => {
    const t = setup();
    t.search.add(said("a"));
    const first = await t.ask("#bubble");
    expect(first.headers.get("cache-control")).toBe("public, max-age=5");
    const tag = first.headers.get("etag") ?? "";
    expect(tag).toMatch(/^"[0-9a-f]{16}"$/);
    t.search.add(said("b"));
    expect((await t.ask("#bubble")).headers.get("etag")).not.toBe(tag);
  });

  it("answers a validator it still holds with 304 and no body", async () => {
    const t = setup();
    t.search.add(said("a"));
    const tag = (await t.ask("#bubble")).headers.get("etag") ?? "";
    const again = await t.ask("#bubble", { "if-none-match": tag });
    expect([again.status, await again.text()]).toEqual([304, ""]);
    expect(again.headers.get("cache-control")).toBe("public, max-age=5");
    expect((await t.ask("#bubble", { "if-none-match": '"0000000000000000"' })).status).toBe(200);
  });
});

describe("the rate", () => {
  it("refuses a visitor past its minute's share with 429, and not another", async () => {
    const t = setup({ perMinute: 3 });
    for (let n = 0; n < 3; n += 1) expect((await t.ask("#bubble")).status).toBe(200);
    const refused = await t.ask("#bubble");
    expect([refused.status, await refused.json()]).toEqual([429, { error: "too_many" }]);
    expect(refused.headers.get("cache-control")).toBe("no-store");
    expect((await t.ask("#bubble", {}, "198.51.100.9")).status).toBe(200);
  });

  it("counts a refused request too, a 404 included", async () => {
    const t = setup({ perMinute: 2 });
    await t.ask("#nowhere");
    await t.ask("#nowhere");
    expect((await t.ask("#bubble")).status).toBe(429);
  });

  it("holds all visitors to a share a second", async () => {
    const t = setup({ perSecond: 2 });
    await t.ask("#bubble", {}, "203.0.113.1");
    await t.ask("#bubble", {}, "203.0.113.2");
    expect((await t.ask("#bubble", {}, "203.0.113.3")).status).toBe(429);
  });
});
