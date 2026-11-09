// A guest's strikes and its mute (D430): the server never relays a muted guest's line, so no Ergo ban is needed. Strikes and
// mutes key on the visitor, so a new name earns no new allowance, and on the world, as the account mutes do (3k).
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Guest } from "./guests.ts";

export interface GuestMutes {
  /** A line refused for what it said: the strike kept, the visitor muted in the world at the setting's count in its window. */
  strike: (guest: Guest, world: string) => void;
  muted: (visitor: string, world: string) => boolean;
  /** Under a mute in any world: no new name while it lives. */
  mutedAnywhere: (visitor: string) => boolean;
}

interface Options {
  now: () => number;
  mute: { strikes: number; windowMinutes: number; minutes: number };
}

const Count = z.object({ n: z.number() });

export function makeGuestMutes(db: DatabaseSync, { now, mute }: Options): GuestMutes {
  const sql = {
    add: db.prepare("INSERT INTO guest_strikes (guest_id, visitor_hash, world, at) VALUES (?, ?, ?, ?)"),
    count: db.prepare("SELECT count(*) AS n FROM guest_strikes WHERE visitor_hash = ? AND world = ? AND at >= ?"),
    mute: db.prepare("INSERT OR REPLACE INTO guest_mutes (visitor_hash, world, until) VALUES (?, ?, ?)"),
    here: db.prepare("SELECT 1 AS yes FROM guest_mutes WHERE visitor_hash = ? AND world = ? AND until > ?"),
    any: db.prepare("SELECT 1 AS yes FROM guest_mutes WHERE visitor_hash = ? AND until > ?"),
  };
  return {
    strike({ id, visitor }, world) {
      const at = now();
      sql.add.run(id, visitor, world, at);
      const { n } = Count.parse(sql.count.get(visitor, world, at - mute.windowMinutes * 60_000));
      if (n >= mute.strikes) sql.mute.run(visitor, world, at + mute.minutes * 60_000);
    },
    muted: (visitor, world) => sql.here.get(visitor, world, now()) !== undefined,
    mutedAnywhere: (visitor) => sql.any.get(visitor, now()) !== undefined,
  };
}
