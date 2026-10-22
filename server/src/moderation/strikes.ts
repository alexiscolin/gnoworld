// An account's strikes (decision 146; slice 3's plan, 3k): its own lines hidden in one world's rooms since
// a time, read from the verdicts, where an account is its pepper-keyed hash, never the address.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Said } from "../irc/lines.ts";
import { roomWorld } from "../rooms/rooms.ts";
import { accountKey, lineTime } from "./check.ts";
import type { Mutes } from "./mute.ts";

// The verdicts by account and time: a strike's count and a line's rate read them (3k).
export const STRIKE_TABLES = `
CREATE INDEX verdicts_by_account ON verdicts (account, at);
`;

export interface Strikes {
  // From `since` to `to`, both counted, by Ergo's time.
  count: (account: string, world: string, span: { since: number; to: number }) => number;
}

export function makeStrikes(db: DatabaseSync, pepper: string): Strikes {
  const Count = z.object({ n: z.number() });
  const hidden = db.prepare(
    "SELECT count(*) AS n FROM verdicts v JOIN rooms r ON r.name = v.room WHERE v.account = ? AND v.action = 'hide' AND v.reason IS NOT 'unknown_edit' AND v.at >= ? AND v.at <= ? AND r.world = ?",
  );
  return {
    count: (account, world, { since, to }) => Count.parse(hidden.get(accountKey(pepper, account), since, to, world)).n,
  };
}

interface StrikeOptions {
  pepper: string;
  now: () => number;
  mute: { strikes: number; windowMinutes: number };
  mutes: Mutes;
  spared: (account: string) => boolean;
}

/** After a hide: the account muted in the line's world once its strikes there reach the setting, within
 * the window back from the line's own time, unless the roles file spares it. */
export function makeStrike(
  db: DatabaseSync,
  { pepper, now, mute, mutes, spared }: StrikeOptions,
): (said: Said) => void {
  const strikes = makeStrikes(db, pepper);
  return (said) => {
    const world = roomWorld(db, said.room);
    if (world === undefined || spared(said.account)) return;
    // Up to the line's own time: a later hide, whose check may settle first, is not counted.
    const at = lineTime(said, now);
    if (strikes.count(said.account, world, { since: at - mute.windowMinutes * 60_000, to: at }) >= mute.strikes) {
      mutes.mute(said.account, world);
    }
  };
}
