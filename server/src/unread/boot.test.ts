import type { DatabaseSync } from "node:sqlite";
import { Address } from "@gnoworld/schemas";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import { afterEach, describe, expect, it } from "vitest";
import { makeApp } from "../app.ts";
import { migrations } from "../migrations.ts";
import { ERGO_EXPIRE_MS } from "../retention/retention.ts";
import { ensureNamed, ensureRooms } from "../rooms/rooms.ts";
import type { Typed } from "../rooms/types.ts";
import { unreadBoot, unreadExpiry } from "./boot.ts";

const T0 = Date.parse("2026-11-13T12:00:00.000Z");
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const ORIGIN = "https://gnoworld.test";
const RULES = { bannedWords: [], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.isOpen) db.close();
});

describe("unreadBoot, as main starts it", () => {
  it("mounts /api/unread on the server's rooms, and hands the retention the store's expiry once it stands", async () => {
    const roles: Typed = { team: new Set(), worlds: new Map([["bubble", { rules: RULES, rooms: new Map() }]]) };
    const db = openDatabase(":memory:", migrations);
    opened.push(db);
    ensureRooms(db, ["bubble"], T0);
    ensureNamed(db, [{ name: "#bubble/shut", world: "bubble" }], T0);
    const old = db.prepare("INSERT INTO read_places (account, room, at, seen) VALUES (?, '#bubble', 1, ?)");
    for (const account of ["g1old", "g1older"]) old.run(account, T0 - ERGO_EXPIRE_MS - 1);
    expect(unreadExpiry.expire(10), "nothing stands yet").toBe(0);

    const app = makeApp(
      logger("a-pepper-of-forty-characters-0123456789", () => true),
      () => true,
    );
    unreadBoot(app, {
      db,
      roles,
      archived: (room) => room === "#bubble/shut",
      session: (token) => (token === "alice" ? ALICE : undefined),
      origins: [ORIGIN],
      log: () => undefined,
      now: () => T0,
    });
    expect(unreadExpiry.expire(10)).toBe(2);

    expect((await app.request("/api/unread")).status).toBe(401);
    const time = new Date(T0).toISOString();
    const posted = await app.request("/api/unread", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, cookie: "__Host-session=alice" },
      body: JSON.stringify({
        places: ["#bubble", "#bubble/shut", "#bubble/never-made"].map((room) => ({ room, time })),
      }),
    });
    expect(posted.status).toBe(204);
    expect(db.prepare("SELECT room FROM read_places ORDER BY room").all()).toEqual([{ room: "#bubble" }]);
  });
});
