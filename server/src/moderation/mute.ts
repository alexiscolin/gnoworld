// The automatic mute (decision 146; slice 3's plan, 3k): an account muted in every room of a world with
// Ergo's m: extban, through SAMODE, for a time a table keeps, so a restart puts the live ones back and lifts
// the ended ones. The account is kept in clear while it is muted: the extban names it.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

export const MUTE_TABLES = `
CREATE TABLE mutes (account TEXT NOT NULL, world TEXT NOT NULL, until INTEGER NOT NULL, PRIMARY KEY (account, world)) STRICT;
`;

export interface Mutes {
  // False when the account is muted there already.
  mute: (account: string, world: string) => boolean;
  // Lifts the ended mutes, keeping one whose lift the link could not send.
  tick: () => void;
  // When the link is back: the live mutes put on again, the ended ones lifted.
  reapply: () => void;
}

interface Options {
  db: DatabaseSync;
  send: (command: "SAMODE", params: readonly string[]) => boolean;
  roomsOf: (world: string) => readonly string[];
  now: () => number;
  forMs: number;
  // ponytail: a world's live mutes at most, the one ending first lifted to make room; Ergo's list holds 100.
  max: number;
}

export function makeMutes({ db, send, roomsOf, now, forMs, max }: Options): Mutes {
  const Rows = z.array(z.object({ account: z.string(), world: z.string() }));
  const Count = z.object({ n: z.number() });
  const sql = {
    live: db.prepare("SELECT 1 FROM mutes WHERE account = ? AND world = ? AND until > ?"),
    count: db.prepare("SELECT count(*) AS n FROM mutes WHERE world = ? AND until > ?"),
    endFirst: db.prepare(
      "UPDATE mutes SET until = ? WHERE rowid = (SELECT rowid FROM mutes WHERE world = ? AND until > ? ORDER BY until LIMIT 1)",
    ),
    add: db.prepare("INSERT OR REPLACE INTO mutes (account, world, until) VALUES (?, ?, ?)"),
    ended: db.prepare("SELECT account, world FROM mutes WHERE until <= ?"),
    lives: db.prepare("SELECT account, world FROM mutes WHERE until > ?"),
    lift: db.prepare("DELETE FROM mutes WHERE account = ? AND world = ? AND until <= ?"),
  };
  // Every room of the world, each sent even when one fails: a later call sends them all again.
  const mode = (sign: "+" | "-", account: string, world: string): boolean =>
    roomsOf(world)
      .map((room) => send("SAMODE", [room, `${sign}b`, `m:${account}`]))
      .every(Boolean);
  const tick = (): void => {
    const at = now();
    for (const { account, world } of Rows.parse(sql.ended.all(at))) {
      if (mode("-", account, world)) sql.lift.run(account, world, at);
    }
  };
  return {
    mute(account, world) {
      const at = now();
      if (sql.live.get(account, world, at) !== undefined) return false;
      if (Count.parse(sql.count.get(world, at)).n >= max) {
        sql.endFirst.run(at, world, at);
        tick();
      }
      sql.add.run(account, world, at + forMs);
      mode("+", account, world);
      return true;
    },
    tick,
    reapply() {
      for (const { account, world } of Rows.parse(sql.lives.all(now()))) mode("+", account, world);
      tick();
    },
  };
}
