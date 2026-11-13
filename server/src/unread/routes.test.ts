import type { DatabaseSync } from "node:sqlite";
import { Address, Unread } from "@gnoworld/schemas";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import { afterEach, describe, expect, it } from "vitest";
import { makeApp } from "../app.ts";
import type { Said } from "../irc/link.ts";
import { makeSearch, SEARCH_TABLES } from "../search/index.ts";
import type { Typed } from "../rooms/types.ts";
import { makeUnread, UNREAD_TABLES, type Unread as UnreadStore } from "./store.ts";
import { unreadRoutes } from "./routes.ts";

// GET /api/unread and POST /api/unread: an account's own places in, its own counts out (docs/plans/slice-13-unread.md, "Threat model").
const MINUTE = 60_000;
const T0 = Date.parse("2026-11-13T12:00:00.000Z");
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const BOB = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const TOKENS = new Map([
  ["alice", ALICE],
  ["bob", BOB],
]);
const ORIGIN = "https://gnoworld.test";
const RULES = { bannedWords: [], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.isOpen) db.close();
});

function setup(perSecond = 1000) {
  const roles: Typed = {
    team: new Set(),
    worlds: new Map([["bubble", { rules: RULES, groups: new Map(), rooms: new Map() }]]),
  };
  const db = openDatabase(":memory:", [SEARCH_TABLES, UNREAD_TABLES]);
  opened.push(db);
  const clock = { now: T0 };
  const search = makeSearch(db, { roles, now: () => clock.now });
  const real = makeUnread(db, { roles, archived: () => false, exists: () => true, now: () => clock.now });
  const calls = { counts: 0 };
  const unread: UnreadStore = {
    ...real,
    counts: (account) => {
      calls.counts += 1;
      return real.counts(account);
    },
  };
  const lines: string[] = [];
  const log = logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line));
  const app = makeApp(log, () => true);
  app.route(
    "/api/unread",
    unreadRoutes({
      unread,
      session: (token) => TOKENS.get(token ?? ""),
      origins: [ORIGIN],
      log,
      now: () => clock.now,
      perSecond,
    }),
  );
  let serial = 0;
  const line = (room: string, account: string, at: number): void => {
    serial += 1;
    const said: Said = { room, account, msgid: `m${String(serial)}`, text: "word", time: new Date(at).toISOString() };
    search.add(said);
  };
  const get = (who?: string) =>
    app.request("/api/unread", { headers: who === undefined ? {} : { cookie: `__Host-session=${who}` } });
  const post = (body: unknown, who?: string, origin: string | null = ORIGIN) =>
    app.request("/api/unread", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(origin === null ? {} : { origin }),
        ...(who === undefined ? {} : { cookie: `__Host-session=${who}` }),
      },
      body: JSON.stringify(body),
    });
  const counts = async (who: string) => {
    const response = await get(who);
    expect(response.status).toBe(200);
    return Unread.parse(await response.json()).worlds;
  };
  const place = (room: string, at: number) => ({ room, time: new Date(at).toISOString() });
  return { app, db, clock, calls, lines, line, get, post, counts, place };
}

describe("GET /api/unread and POST /api/unread, who may ask", () => {
  it("answers a visitor with no session 401 on both, and stores nothing", async () => {
    const t = setup();
    const read = await t.get();
    expect([read.status, await read.json()]).toEqual([401, { error: "unauthenticated" }]);
    const write = await t.post({ places: [t.place("#bubble", T0)] });
    expect(write.status).toBe(401);
    expect(t.db.prepare("SELECT count(*) AS n FROM read_places").get()?.["n"]).toBe(0);
  });

  it("refuses a POST from no listed Origin 403 and one that is not JSON 415", async () => {
    const t = setup();
    expect((await t.post({ places: [t.place("#bubble", T0)] }, "alice", null)).status).toBe(403);
    expect((await t.post({ places: [t.place("#bubble", T0)] }, "alice", "https://evil.test")).status).toBe(403);
    const form = await t.app.request("/api/unread", {
      method: "POST",
      headers: { "content-type": "text/plain", origin: ORIGIN, cookie: "__Host-session=alice" },
      body: "{}",
    });
    expect(form.status).toBe(415);
  });

  it("never reads a cache: the answer is no-store", async () => {
    const t = setup();
    expect((await t.get("alice")).headers.get("cache-control")).toBe("no-store");
  });
});

describe("the places a page forwards", () => {
  it("raises a world's count for lines past the place and answers 204", async () => {
    const t = setup();
    t.line("#bubble", BOB, T0 - 2 * MINUTE);
    t.line("#bubble", BOB, T0 - MINUTE);
    const written = await t.post({ places: [t.place("#bubble", T0 - 90_000)] }, "alice");
    expect(written.status).toBe(204);
    expect(await t.counts("alice")).toEqual({ bubble: 1 });
  });

  it("ignores an account named in the body: the body is refused whole and no account's rows are written", async () => {
    const t = setup();
    for (const body of [
      { places: [t.place("#bubble", T0)], account: BOB },
      { places: [{ ...t.place("#bubble", T0), account: BOB }] },
    ]) {
      expect((await t.post(body, "alice")).status).toBe(400);
    }
    expect(t.db.prepare("SELECT count(*) AS n FROM read_places").get()?.["n"]).toBe(0);
  });

  it("refuses a body that breaks the schema, a hundred and one places among them", async () => {
    const t = setup();
    const many = Array.from({ length: 101 }, (_, n) => t.place(`#room${String(n)}`, T0));
    for (const body of [{ places: many }, { places: [] }, { places: [{ room: "bubble", time: "x" }] }, "text"]) {
      expect((await t.post(body, "alice")).status).toBe(400);
    }
    const broken = await t.app.request("/api/unread", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, cookie: "__Host-session=alice" },
      body: "{",
    });
    expect(broken.status).toBe(400);
  });

  it("stores no place more than 5 minutes past now, and the rest of the call", async () => {
    const t = setup();
    t.line("#bubble", BOB, T0 - MINUTE);
    t.line("#garden", BOB, T0 - MINUTE);
    const ahead = t.place("#bubble", T0 + 10 * MINUTE);
    const fine = t.place("#garden", T0 - 2 * MINUTE);
    expect((await t.post({ places: [ahead, fine] }, "alice")).status).toBe(204);
    expect(await t.counts("alice")).toEqual({ garden: 1 });
  });

  it("keeps one account's places out of another's answer", async () => {
    const t = setup();
    t.line("#bubble", BOB, T0 - MINUTE);
    await t.post({ places: [t.place("#bubble", T0 - 5 * MINUTE)] }, "alice");
    expect(await t.counts("bob")).toEqual({});
    expect(await t.counts("alice")).toEqual({ bubble: 1 });
  });

  it("an account's 31st POST in a minute is refused, and not another account's", async () => {
    const t = setup();
    const body = { places: [t.place("#bubble", T0)] };
    for (let n = 0; n < 30; n += 1) expect((await t.post(body, "alice")).status).toBe(204);
    expect((await t.post(body, "alice")).status).toBe(429);
    expect((await t.post(body, "bob")).status).toBe(204);
    t.clock.now += MINUTE;
    expect((await t.post(body, "alice")).status).toBe(204);
  });

  it("refuses a POST past the second's limit shared by all accounts, then takes one the next second", async () => {
    const t = setup(2);
    const body = { places: [t.place("#bubble", T0)] };
    expect((await t.post(body, "alice")).status).toBe(204);
    expect((await t.post(body, "bob")).status).toBe(204);
    expect((await t.post(body, "alice")).status).toBe(429);
    expect((await t.post(body, "bob")).status).toBe(429);
    t.clock.now += 1000;
    expect((await t.post(body, "bob")).status).toBe(204);
  });
});

describe("the counts a page reads", () => {
  it("counts once for two calls within 5 seconds, and again after", async () => {
    const t = setup();
    await t.counts("alice");
    await t.counts("alice");
    expect(t.calls.counts).toBe(1);
    t.clock.now += 5_000;
    await t.counts("alice");
    expect(t.calls.counts).toBe(2);
  });

  it("counts again at once after the account's own write, so a room read shows within one refresh", async () => {
    const t = setup();
    t.line("#bubble", BOB, T0 - MINUTE);
    await t.post({ places: [t.place("#bubble", T0 - 2 * MINUTE)] }, "alice");
    expect(await t.counts("alice")).toEqual({ bubble: 1 });
    await t.post({ places: [t.place("#bubble", T0)] }, "alice");
    expect(await t.counts("alice")).toEqual({});
  });

  it("keeps each account's cached answer to itself", async () => {
    const t = setup();
    t.line("#bubble", BOB, T0 - MINUTE);
    await t.post({ places: [t.place("#bubble", T0 - 2 * MINUTE)] }, "alice");
    expect(await t.counts("alice")).toEqual({ bubble: 1 });
    expect(await t.counts("bob")).toEqual({});
  });

  it("refuses the 61st call in a minute with 429", async () => {
    const t = setup();
    for (let n = 0; n < 60; n += 1) expect((await t.get("alice")).status).toBe(200);
    expect((await t.get("alice")).status).toBe(429);
    expect((await t.get("bob")).status).toBe(200);
  });
});
