// Each world's unread pill, server side: a copy of the reading places Ergo confirmed to an account (the page forwards the echoes; the
// server cannot read another account's place from Ergo), counted against the search index's lines. A place never leads Ergo's, only
// follows it; a count is made only for a room the account may read as it is now.
import type { DatabaseSync } from "node:sqlite";
import { PLACE_AHEAD_MS } from "@gnoworld/core";
import { UNREAD_COUNT_MOST } from "@gnoworld/schemas";
import { z } from "zod";
import { ERGO_EXPIRE_MS } from "../retention/retention.ts";
import { worldOf } from "../rooms/rooms.ts";
import { mayRead, searchable, type Typed } from "../rooms/types.ts";

/** The rooms an account's places cover at most: the one read longest ago goes when another comes. */
const PLACES_PER_ACCOUNT = 500;

export const UNREAD_TABLES = `
CREATE TABLE read_places (
  account TEXT NOT NULL,
  room TEXT NOT NULL,
  at INTEGER NOT NULL,
  seen INTEGER NOT NULL,
  PRIMARY KEY (account, room)
) STRICT;
CREATE INDEX read_places_by_seen ON read_places (seen);
`;

export interface Unread {
  /**
   * Keeps each place that passes, in one transaction: a room the server made, which the account may read as it is now, and a time
   * (ms) at most 5 minutes past now; the later of a room's place and its time stays. Answers how many were kept.
   */
  places: (account: string, places: readonly { room: string; time: number }[]) => number;
  /** One place of `places`: false when it is not kept. */
  place: (account: string, room: string, time: number) => boolean;
  /** Each world's lines past the account's places, by others, in the rooms it may read now; the worlds with none are left out. */
  counts: (account: string) => Record<string, number>;
  /** Retention: deletes at most `limit` places read more than 90 days ago; how many went. */
  expire: (limit: number) => number;
}

interface Options {
  roles: Typed;
  /** An archived room is unlisted whatever its type: it counts nothing. */
  archived: (room: string) => boolean;
  /** Whether the server made the room: a place is kept for no other. */
  exists: (room: string) => boolean;
  now: () => number;
}

const Places = z.array(z.object({ room: z.string(), at: z.number() }));
const Count = z.object({ n: z.number() });

export function makeUnread(db: DatabaseSync, { roles, archived, exists, now }: Options): Unread {
  const sql = {
    put: db.prepare(
      "INSERT INTO read_places (account, room, at, seen) VALUES (?, ?, ?, ?) ON CONFLICT (account, room) DO UPDATE SET at = max(at, excluded.at), seen = excluded.seen",
    ),
    trim: db.prepare(
      "DELETE FROM read_places WHERE rowid IN (SELECT rowid FROM read_places WHERE account = ? ORDER BY seen DESC, rowid DESC LIMIT -1 OFFSET ?)",
    ),
    old: db.prepare("DELETE FROM read_places WHERE seen < ?"),
    expire: db.prepare(
      "DELETE FROM read_places WHERE rowid IN (SELECT rowid FROM read_places WHERE seen < ? ORDER BY seen LIMIT ?)",
    ),
    of: db.prepare("SELECT room, at FROM read_places WHERE account = ? AND seen >= ?"),
    after: db.prepare(
      "SELECT count(*) AS n FROM (SELECT 1 FROM lines WHERE room = ? AND at > ? AND account <> ? LIMIT ?)",
    ),
  };
  // A room a place or a count covers: made by the server, searchable, not archived, and read by the account as it is now.
  const covered = (room: string, account: string): boolean =>
    room.startsWith("#") && exists(room) && searchable(roles, room) && !archived(room) && mayRead(roles, room, account);
  const unread: Unread = {
    places(account, places) {
      const at = now();
      const kept = places.filter(({ room, time }) => time <= at + PLACE_AHEAD_MS && covered(room, account));
      if (kept.length === 0) return 0;
      db.exec("BEGIN IMMEDIATE");
      try {
        sql.old.run(at - ERGO_EXPIRE_MS);
        for (const { room, time } of kept) sql.put.run(account, room, time, at);
        sql.trim.run(account, PLACES_PER_ACCOUNT);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return kept.length;
    },
    expire: (limit) => Number(sql.expire.run(now() - ERGO_EXPIRE_MS, limit).changes),
    place: (account, room, time) => unread.places(account, [{ room, time }]) === 1,
    counts(account) {
      const worlds: Record<string, number> = {};
      for (const { room, at } of Places.parse(sql.of.all(account, now() - ERGO_EXPIRE_MS))) {
        if (!covered(room, account)) continue;
        const n = Count.parse(sql.after.get(room, at, account, UNREAD_COUNT_MOST)).n;
        const world = worldOf(room);
        worlds[world] = Math.min((worlds[world] ?? 0) + n, UNREAD_COUNT_MOST);
      }
      return Object.fromEntries(Object.entries(worlds).filter(([, n]) => n > 0));
    },
  };
  return unread;
}
