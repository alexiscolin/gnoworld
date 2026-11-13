// The guests (D430): a visitor with no account who speaks through the server. A row holds a name, the SHA-256 of
// its cookie's value (never the value), its visitor as the verdicts keep an address (an HMAC), and its two times;
// a guest unused for 24 hours is purged. A strike is kept per guest and visitor, a mute per visitor and world.
import { createHash, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { GUEST_NAME_BYTES, guestName } from "@gnoworld/core";
import { z } from "zod";

export const GUEST_TABLES = `
CREATE TABLE guests (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  token_hash BLOB NOT NULL UNIQUE,
  visitor_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
) STRICT;
CREATE INDEX guests_by_visitor ON guests (visitor_hash);
CREATE INDEX guests_by_use ON guests (last_seen);
CREATE TABLE guest_strikes (
  guest_id INTEGER NOT NULL,
  visitor_hash TEXT NOT NULL,
  world TEXT NOT NULL,
  at INTEGER NOT NULL
) STRICT;
CREATE INDEX guest_strikes_by_visitor ON guest_strikes (visitor_hash, world, at);
CREATE TABLE guest_mutes (
  visitor_hash TEXT NOT NULL,
  world TEXT NOT NULL,
  until INTEGER NOT NULL,
  PRIMARY KEY (visitor_hash, world)
) STRICT;
`;

/** The draw kept giving a name a living guest holds: the route answers that it is not ready. */
export class NamesTaken extends Error {}

export interface Guest {
  id: number;
  /** Without "anon/": the relayed nick is GUEST_PREFIX + name. */
  name: string;
  visitor: string;
}

export interface Guests {
  /** A new guest for a visitor (the hash of its /48, which strikes and mutes key on): a name nobody holds, drawn again on a duplicate, and its cookie's value. */
  mint: (visitor: string) => Guest & { token: string };
  /** The guest a cookie's value names, changing nothing; none for no value, an unknown one, or a purged guest. */
  byToken: (token: string | undefined) => Guest | undefined;
  /** The same guest, its last use now: a guest speaking is living, a cookie shown again is not. */
  use: (token: string | undefined) => Guest | undefined;
  /** The guests living now. */
  alive: () => number;
  /** Removes the guests unused for 24 hours and the strikes and mutes that ended; how many guests went. */
  purge: () => number;
}

interface Options {
  now: () => number;
  /** A CSPRNG's bytes, given by the caller; node's by default. */
  random?: (bytes: number) => Uint8Array;
}

const DAY_MS = 24 * 60 * 60_000;
const LIVING_MS = 60 * 60_000;
// A name is drawn again on a duplicate; a source that keeps drawing the same one fails here, never loops.
const DRAWS = 8;
const Row = z.object({ id: z.number(), name: z.string(), visitor_hash: z.string() });
const Count = z.object({ n: z.number() });

export function makeGuests(db: DatabaseSync, { now, random = (bytes) => randomBytes(bytes) }: Options): Guests {
  const sha = (token: string): Buffer => createHash("sha256").update(token).digest();
  const sql = {
    add: db.prepare(
      "INSERT INTO guests (name, token_hash, visitor_hash, created_at, last_seen) VALUES (?, ?, ?, ?, ?) RETURNING id",
    ),
    find: db.prepare("SELECT id, name, visitor_hash FROM guests WHERE token_hash = ?"),
    touch: db.prepare("UPDATE guests SET last_seen = ? WHERE id = ?"),
    count: db.prepare("SELECT count(*) AS n FROM guests WHERE last_seen > ?"),
    idle: db.prepare("DELETE FROM guests WHERE last_seen <= ?"),
    strikes: db.prepare("DELETE FROM guest_strikes WHERE at < ?"),
    mutes: db.prepare("DELETE FROM guest_mutes WHERE until <= ?"),
  };
  const find = (token: string | undefined): Guest | undefined => {
    if (token === undefined || token === "") return undefined;
    const row = z.optional(Row).parse(sql.find.get(sha(token)));
    return row === undefined ? undefined : { id: row.id, name: row.name, visitor: row.visitor_hash };
  };
  return {
    mint(visitor) {
      const at = now();
      for (let draw = 0; draw < DRAWS; draw += 1) {
        const name = guestName(random(GUEST_NAME_BYTES));
        const token = Buffer.from(random(32)).toString("base64url");
        try {
          const { id } = z.object({ id: z.number() }).parse(sql.add.get(name, sha(token), visitor, at, at));
          return { id, name, visitor, token };
        } catch (error) {
          if (!(error instanceof Error && error.message.includes("UNIQUE"))) throw error;
        }
      }
      throw new NamesTaken("the draw gave a name a living guest holds, eight times");
    },
    byToken: find,
    use(token) {
      const guest = find(token);
      if (guest !== undefined) sql.touch.run(now(), guest.id);
      return guest;
    },
    // Living is used within the hour: a busy day never locks the chat, while a guest is kept 24 hours.
    alive: () => Count.parse(sql.count.get(now() - LIVING_MS)).n,
    purge() {
      const at = now();
      const gone = Number(sql.idle.run(at - DAY_MS).changes);
      sql.strikes.run(at - DAY_MS);
      sql.mutes.run(at);
      return gone;
    },
  };
}
