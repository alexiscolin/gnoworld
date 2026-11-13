import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { GUEST_NAME_BYTES } from "@gnoworld/core";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import { afterEach, describe, expect, it } from "vitest";
import { migrations } from "../migrations.ts";
import { makeRetention } from "../retention/retention.ts";
import { GUEST_TABLES, makeGuests } from "./guests.ts";

const T0 = Date.parse("2026-11-09T12:00:00.000Z");
const HOUR = 60 * 60_000;
const VISITOR = "a".repeat(64);
const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

// Bytes counted up, so a draw is known: `fixed` names are the same draw each time.
const drawn = (fixed?: Uint8Array) => {
  let n = 0;
  return (bytes: number): Uint8Array => {
    if (fixed !== undefined && bytes === GUEST_NAME_BYTES) return fixed;
    n += 1;
    return Uint8Array.from({ length: bytes }, (_, i) => (n * 31 + i * 7) & 255);
  };
};

const setup = (random: (bytes: number) => Uint8Array = drawn()) => {
  const db = openDatabase(":memory:", [GUEST_TABLES]);
  opened.push(db);
  const clock = { now: T0 };
  const guests = makeGuests(db, { now: () => clock.now, random });
  return { db, clock, guests };
};
const sha = (token: string): string => createHash("sha256").update(token).digest("hex").toUpperCase();

describe("the guests table", () => {
  it("is strict, holds its columns, and refuses a second guest with the same name or the same cookie hash", () => {
    const { db } = setup();
    const columns = (db.prepare("SELECT name FROM pragma_table_info('guests')").all() as { name: string }[]).map(
      (each) => each.name,
    );
    expect(columns.toSorted()).toEqual(["created_at", "id", "last_seen", "name", "token_hash", "visitor_hash"]);
    expect(db.prepare("SELECT strict FROM pragma_table_list WHERE name = 'guests'").get()).toEqual({ strict: 1 });
    const add = db.prepare(
      "INSERT INTO guests (name, token_hash, visitor_hash, created_at, last_seen) VALUES (?, ?, 'v', 0, 0)",
    );
    add.run("a-a-aaaa", Buffer.from("1"));
    expect(() => add.run("a-a-aaaa", Buffer.from("2"))).toThrow(/UNIQUE/);
    expect(() => add.run("b-b-bbbb", Buffer.from("1"))).toThrow(/UNIQUE/);
  });

  it("is one of the server's migrations, appended after the others (the pinned list holds its hash)", () => {
    expect(migrations).toContain(GUEST_TABLES);
    expect(migrations.indexOf(GUEST_TABLES)).toBe(15);
  });
});

describe("minting a guest", () => {
  it("gives a name and 256 random bits of cookie, of which only the SHA-256 is stored, never the value", () => {
    const { db, guests } = setup();
    const guest = guests.mint(VISITOR);
    expect(guest.name).toMatch(/^[a-z]+-[a-z]+-[a-z2-7]{4}$/);
    expect(guest.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(guest.visitor).toBe(VISITOR);
    const rows = db
      .prepare("SELECT name, hex(token_hash) AS hash, visitor_hash, created_at, last_seen FROM guests")
      .all();
    expect(rows).toEqual([
      { name: guest.name, hash: sha(guest.token), visitor_hash: VISITOR, created_at: T0, last_seen: T0 },
    ]);
    expect(JSON.stringify(db.prepare("SELECT * FROM guests").all())).not.toContain(guest.token);
  });

  it("draws the name again when another guest holds it, so two living guests never share one", () => {
    const same = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
    const { guests } = setup(drawn(same));
    const first = guests.mint(VISITOR);
    // The same draw each time: the store must not loop for ever, nor hand out the held name.
    expect(() => guests.mint(VISITOR)).toThrow();
    expect(guests.alive()).toBe(1);
    expect(first.name).toMatch(/^[a-z]+-[a-z]+-[a-z2-7]{4}$/);
  });

  it("takes another name once a duplicate draw is followed by a free one", () => {
    const first = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
    const second = Uint8Array.from([9, 8, 7, 6, 5, 4, 3, 2]);
    const calls = { names: 0 };
    const random = (bytes: number): Uint8Array => {
      if (bytes !== GUEST_NAME_BYTES) return Uint8Array.from({ length: bytes }, (_, i) => (calls.names * 13 + i) & 255);
      calls.names += 1;
      return calls.names <= 2 ? first : second;
    };
    const { guests } = setup(random);
    const a = guests.mint(VISITOR);
    const b = guests.mint(VISITOR);
    expect(b.name).not.toBe(a.name);
    expect(guests.alive()).toBe(2);
  });

  it("never takes a name from its caller: the visitor is a hash, the name comes from the draw alone", () => {
    const { guests } = setup();
    const guest = guests.mint("brave-otter-ab23");
    expect(guest.name).not.toBe("brave-otter-ab23");
  });
});

describe("finding a guest by its cookie", () => {
  it("finds the guest whose cookie's value it is, and none for another value, none or an empty one", () => {
    const { guests } = setup();
    const guest = guests.mint(VISITOR);
    expect(guests.byToken(guest.token)).toEqual({ id: guest.id, name: guest.name, visitor: VISITOR });
    expect(guests.byToken(`${guest.token}x`)).toBeUndefined();
    expect(guests.byToken(undefined)).toBeUndefined();
    expect(guests.byToken("")).toBeUndefined();
  });

  it("changes nothing by a lookup: a cookie shown again does not make a guest used, so names cannot be kept alive for free", () => {
    const { db, clock, guests } = setup();
    const guest = guests.mint(VISITOR);
    clock.now = T0 + 5 * HOUR;
    expect(guests.byToken(guest.token)?.name).toBe(guest.name);
    expect(db.prepare("SELECT last_seen FROM guests").get()).toEqual({ last_seen: T0 });
  });

  it("marks the guest used now by use(), so its 24 hours start again at each line it says", () => {
    const { db, clock, guests } = setup();
    const guest = guests.mint(VISITOR);
    clock.now = T0 + 5 * HOUR;
    expect(guests.use(guest.token)).toEqual({ id: guest.id, name: guest.name, visitor: VISITOR });
    expect(guests.use(undefined)).toBeUndefined();
    expect(guests.use(`${guest.token}x`)).toBeUndefined();
    expect(db.prepare("SELECT last_seen, created_at FROM guests").get()).toEqual({
      last_seen: T0 + 5 * HOUR,
      created_at: T0,
    });
  });

  it("counts the guests living as those used within the hour, though a guest is kept 24 hours", () => {
    const { clock, guests } = setup();
    const guest = guests.mint(VISITOR);
    clock.now = T0 + HOUR - 1;
    expect(guests.alive()).toBe(1);
    clock.now = T0 + HOUR;
    expect(guests.alive()).toBe(0);
    expect(guests.byToken(guest.token)?.name).toBe(guest.name);
    guests.use(guest.token);
    expect(guests.alive()).toBe(1);
    clock.now = T0 + 2 * HOUR - 1;
    expect(guests.alive()).toBe(1);
    clock.now = T0 + 2 * HOUR;
    expect(guests.alive()).toBe(0);
  });

  it("counts the guests living, and a second cookie is another guest", () => {
    const { guests } = setup();
    expect(guests.alive()).toBe(0);
    const [a, b] = [guests.mint(VISITOR), guests.mint(VISITOR)];
    expect(guests.alive()).toBe(2);
    expect(guests.byToken(a.token)?.name).not.toBe(guests.byToken(b.token)?.name);
  });
});

describe("a guest kept 24 hours after its last use", () => {
  it("is purged at 24 hours unused, not at 24 hours less a millisecond", () => {
    const { clock, guests } = setup();
    const guest = guests.mint(VISITOR);
    clock.now = T0 + 24 * HOUR - 1;
    expect(guests.purge()).toBe(0);
    expect(guests.use(guest.token)).toBeDefined();
    // The use above restarted the 24 hours.
    clock.now = T0 + 48 * HOUR - 2;
    expect(guests.purge()).toBe(0);
    clock.now = T0 + 48 * HOUR - 1;
    expect(guests.purge()).toBe(1);
    expect(guests.byToken(guest.token)).toBeUndefined();
    expect(guests.alive()).toBe(0);
  });

  it("purges the strikes and the mutes that ended, and keeps a mute that lives", () => {
    const { db, clock, guests } = setup();
    db.prepare("INSERT INTO guest_strikes (guest_id, visitor_hash, world, at) VALUES (1, ?, 'earth', ?)").run(
      VISITOR,
      T0,
    );
    db.prepare("INSERT INTO guest_mutes (visitor_hash, world, until) VALUES (?, 'earth', ?)").run(VISITOR, T0 + HOUR);
    db.prepare("INSERT INTO guest_mutes (visitor_hash, world, until) VALUES (?, 'bubble', ?)").run(
      VISITOR,
      T0 + 30 * HOUR,
    );
    clock.now = T0 + 25 * HOUR;
    guests.purge();
    expect(db.prepare("SELECT count(*) AS n FROM guest_strikes").get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT world FROM guest_mutes").all()).toEqual([{ world: "bubble" }]);
  });

  it("is run by the server's retention, with its tick, and keeps a guest used 23 hours ago", () => {
    const db = openDatabase(":memory:", migrations);
    opened.push(db);
    const clock = { now: T0 };
    const guests = makeGuests(db, { now: () => clock.now, random: drawn() });
    const old = guests.mint(VISITOR);
    clock.now = T0 + 2 * HOUR;
    const recent = guests.mint(VISITOR);
    clock.now = T0 + 25 * HOUR;
    makeRetention(db, {
      log: logger("a-pepper-of-forty-characters-0123456789", () => true),
      now: () => clock.now,
    }).tick();
    expect(guests.byToken(old.token)).toBeUndefined();
    expect(guests.byToken(recent.token)?.name).toBe(recent.name);
  });

  it("purges the guests' room counts older than 25 hours, keeping each room's latest hour for the sweep's idle test", () => {
    const db = openDatabase(":memory:", migrations);
    opened.push(db);
    const hour = Math.floor(T0 / HOUR);
    const add = db.prepare("INSERT INTO room_said (room, hour, n) VALUES (?, ?, 3)");
    for (const [room, ago] of [
      ["#earth/a", 30],
      ["#earth/a", 26],
      ["#earth/a", 24],
      ["#earth/b", 400],
      ["#earth/b", 300],
    ] as const)
      add.run(room, hour - ago);
    makeRetention(db, { log: logger("a-pepper-of-forty-characters-0123456789", () => true), now: () => T0 }).tick();
    expect(db.prepare("SELECT room, hour - ? AS ago FROM room_said ORDER BY room, hour").all(hour)).toEqual([
      { room: "#earth/a", ago: -24 },
      { room: "#earth/b", ago: -300 },
    ]);
  });
});
