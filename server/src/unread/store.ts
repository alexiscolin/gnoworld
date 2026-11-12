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
  /** Keeps the later of the room's place and `time` (ms); false for a time more than 5 minutes past now, which is kept for none. */
  place: (account: string, room: string, time: number) => boolean;
  /** Each world's lines past the account's places, by others, in the rooms it may read now; the worlds with none are left out. */
  counts: (account: string) => Record<string, number>;
}

interface Options {
  roles: Typed;
  /** An archived room is unlisted whatever its type: it counts nothing. */
  archived: (room: string) => boolean;
  now: () => number;
}

const Places = z.array(z.object({ room: z.string(), at: z.number() }));
const Count = z.object({ n: z.number() });

export function makeUnread(db: DatabaseSync, { roles, archived, now }: Options): Unread {
  const sql = {
    put: db.prepare(
      "INSERT INTO read_places (account, room, at, seen) VALUES (?, ?, ?, ?) ON CONFLICT (account, room) DO UPDATE SET at = max(at, excluded.at), seen = excluded.seen",
    ),
    trim: db.prepare(
      "DELETE FROM read_places WHERE rowid IN (SELECT rowid FROM read_places WHERE account = ? ORDER BY seen DESC, rowid DESC LIMIT -1 OFFSET ?)",
    ),
    old: db.prepare("DELETE FROM read_places WHERE seen < ?"),
    of: db.prepare("SELECT room, at FROM read_places WHERE account = ? AND seen >= ?"),
    after: db.prepare(
      "SELECT count(*) AS n FROM (SELECT 1 FROM lines WHERE room = ? AND at > ? AND account <> ? LIMIT ?)",
    ),
  };
  return {
    place(account, room, time) {
      const at = now();
      if (time > at + PLACE_AHEAD_MS) return false;
      sql.old.run(at - ERGO_EXPIRE_MS);
      sql.put.run(account, room, time, at);
      sql.trim.run(account, PLACES_PER_ACCOUNT);
      return true;
    },
    counts(account) {
      const worlds: Record<string, number> = {};
      for (const { room, at } of Places.parse(sql.of.all(account, now() - ERGO_EXPIRE_MS))) {
        if (!room.startsWith("#") || !searchable(roles, room) || archived(room) || !mayRead(roles, room, account))
          continue;
        const n = Count.parse(sql.after.get(room, at, account, UNREAD_COUNT_MOST)).n;
        const world = worldOf(room);
        worlds[world] = Math.min((worlds[world] ?? 0) + n, UNREAD_COUNT_MOST);
      }
      return Object.fromEntries(Object.entries(worlds).filter(([, n]) => n > 0));
    },
  };
}
