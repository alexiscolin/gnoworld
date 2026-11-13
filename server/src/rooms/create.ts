// A world's further rooms (slice 3's plan, 3l; decisions 147, 162): made by its moderators as
// #<world>/<name>, recorded, joined by the bot and open to accounts (+M); archived, never destroyed:
// read-only (+m) and unlisted (+s), its name and its place in the world's cap kept. The reconciler
// (reconcile.ts, 3m) puts the modes back from what Ergo says, so a room Ergo lost comes back as it was.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Command } from "../irc/lines.ts";
import { mainRoom, worldOf } from "./rooms.ts";

export const ROOM_STATE = `
ALTER TABLE rooms ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
`;

// The rooms made for realms (D390), told from a moderator's: they have a cap of their own and take nothing of a world's.
export const REALM_TABLES = `
CREATE TABLE realm_rooms (name TEXT PRIMARY KEY) STRICT;
`;

// The realm a realm's room was made for (its name holds only a hash of it), so a list can link the room to the realm's page; null for a
// room made before this column, filled from the worlds file or at the first ask for the realm (tagRealm).
export const REALM_PATH = `
ALTER TABLE realm_rooms ADD COLUMN path TEXT;
`;

// The Earth's public rooms (D394): any signed-in account makes one, so each records its maker, who moderates it, and when.
export const EARTH_TABLES = `
CREATE TABLE earth_rooms (name TEXT PRIMARY KEY, maker TEXT NOT NULL, created_at INTEGER NOT NULL) STRICT;
CREATE INDEX earth_rooms_by_maker ON earth_rooms (maker, created_at);
`;

/** The Earth's public rooms at most, the live ones: an archived room keeps its name and frees its place. */
export const EARTH_ROOMS_MAX = 1_000;
/** The public rooms ever made, archived ones too: an archived room stays a row, a channel and a list entry, so making and archiving frees none. */
export const EARTH_ROWS_MAX = 5_000;
/** The public rooms an account makes in a day, archived ones counted. */
export const EARTH_PER_DAY = 3;

// The realm rooms at most, all worlds together.
const REALM_ROOMS_MAX = 5_000;

const DAY_MS = 24 * 60 * 60_000;

// Ergo's channellen (deploy/ergo/ircd.yaml.tmpl).
const CHANNEL_MAX = 64;

export interface Rooms {
  create: (world: string, name: string) => { made: string } | "exists" | "full" | "too_long";
  /** A realm's room, named by core's realmRoom: made once, in its world, whatever the world's moderators' cap. */
  realm: (room: string, reserve?: number, path?: string) => { made: string } | "exists" | "full";
  /** Records the realm `path` of a realm's room that has none yet (made before the column); a room another's or already tagged is left alone. */
  tagRealm: (room: string, path: string) => void;
  /** What `realm` would answer, with no work done: "ok", "exists" or "full". */
  mayRealm: (room: string, reserve?: number) => "ok" | "exists" | "full";
  /** Whether a room is a realm's (made for a realm, not a moderator's or the Earth's). */
  isRealm: (room: string) => boolean;
  /** What `earth` would answer, with no work done: "ok", or the refusal. */
  mayEarth: (maker: string, name: string) => "ok" | "exists" | "full" | "too_long" | "day";
  /** A public room of the Earth (D394), made by any account: its own cap and its maker's 3 a day, none of a world's 20. */
  earth: (maker: string, name: string) => { made: string } | "exists" | "full" | "too_long" | "day";
  /** The account that made a public room of the Earth, who moderates it; none for any other room. */
  maker: (room: string) => string | undefined;
  exists: (room: string) => boolean;
  archive: (world: string, name: string) => "archived" | "not_found";
  archived: (room: string) => boolean;
}

interface Options {
  db: DatabaseSync;
  send: (command: Command, params: readonly string[]) => boolean;
  now: () => number;
  // A world's rooms at most, its main room aside, archived ones counted.
  max: number;
  // The realm rooms at most, REALM_ROOMS_MAX unless a test says less.
  realmMax?: number;
  // The Earth's public rooms at most, EARTH_ROOMS_MAX unless a test says less.
  earthMax?: number;
  // The public rooms ever made, EARTH_ROWS_MAX unless a test says less.
  earthRowsMax?: number;
}

// The Earth's public rooms' statements: how many there are (all, and live), an account's in a day, one made, a room's maker.
const earthSql = (db: DatabaseSync) => ({
  earth: db.prepare(
    "SELECT count(*) AS rows, coalesce(sum(r.archived = 0), 0) AS live FROM earth_rooms e JOIN rooms r ON r.name = e.name",
  ),
  today: db.prepare("SELECT count(*) AS n FROM earth_rooms WHERE maker = ? AND created_at > ?"),
  made: db.prepare("INSERT INTO earth_rooms (name, maker, created_at) VALUES (?, ?, ?)"),
  maker: db.prepare("SELECT maker FROM earth_rooms WHERE name = ?"),
});

// Every statement the rooms keep, prepared once: counts, inserts and a room's state.
const roomSql = (db: DatabaseSync) => ({
  count: db.prepare(
    "SELECT count(*) AS n FROM rooms WHERE world = ? AND name <> ? AND name NOT IN (SELECT name FROM realm_rooms UNION SELECT name FROM earth_rooms)",
  ),
  realms: db.prepare("SELECT count(*) AS n FROM realm_rooms"),
  realm: db.prepare("INSERT INTO realm_rooms (name, path) VALUES (?, ?)"),
  tag: db.prepare("UPDATE realm_rooms SET path = ? WHERE name = ? AND path IS NULL"),
  isRealm: db.prepare("SELECT 1 AS yes FROM realm_rooms WHERE name = ?"),
  ...earthSql(db),
  add: db.prepare("INSERT INTO rooms (name, world, created_at) VALUES (?, ?, ?)"),
  // A room's name holds its world's.
  state: db.prepare("SELECT archived FROM rooms WHERE name = ?"),
  archive: db.prepare("UPDATE rooms SET archived = 1 WHERE name = ?"),
});

export function makeRooms({
  db,
  send,
  now,
  max,
  realmMax = REALM_ROOMS_MAX,
  earthMax = EARTH_ROOMS_MAX,
  earthRowsMax = EARTH_ROWS_MAX,
}: Options): Rooms {
  const Count = z.object({ n: z.number() });
  const State = z.object({ archived: z.number() }).optional();
  const RealmRow = z.object({ yes: z.number() }).optional();
  const sql = roomSql(db);
  const stateOf = (room: string) => State.parse(sql.state.get(room));
  const open = (room: string, world: string) => {
    sql.add.run(room, world, now());
    send("JOIN", [room]);
    // Open to accounts, and to all: Ergo makes a room invite-only (+i).
    send("SAMODE", [room, "+M"]);
    send("SAMODE", [room, "-i"]);
    return { made: room };
  };
  const Held = z.object({ rows: z.number(), live: z.number() });
  const Maker = z.object({ maker: z.string() }).optional();
  const mayEarth: Rooms["mayEarth"] = (maker, name) => {
    const room = `${mainRoom("earth")}/${name}`;
    if (room.length > CHANNEL_MAX) return "too_long";
    if (stateOf(room) !== undefined) return "exists";
    if (Count.parse(sql.today.get(maker, now() - DAY_MS)).n >= EARTH_PER_DAY) return "day";
    const { rows, live } = Held.parse(sql.earth.get());
    return live >= earthMax || rows >= earthRowsMax ? "full" : "ok";
  };
  const mayRealm: Rooms["mayRealm"] = (room, reserve = 0) => {
    if (stateOf(room) !== undefined) return "exists";
    return Count.parse(sql.realms.get()).n >= realmMax - reserve ? "full" : "ok";
  };
  return {
    mayEarth,
    mayRealm,
    isRealm: (room) => RealmRow.parse(sql.isRealm.get(room)) !== undefined,
    earth(maker, name) {
      const may = mayEarth(maker, name);
      if (may !== "ok") return may;
      const room = `${mainRoom("earth")}/${name}`;
      const made = open(room, "earth");
      sql.made.run(room, maker, now());
      return made;
    },
    maker: (room) => Maker.parse(sql.maker.get(room))?.maker,
    create(world, name) {
      const room = `${mainRoom(world)}/${name}`;
      if (room.length > CHANNEL_MAX) return "too_long";
      if (stateOf(room) !== undefined) return "exists";
      if (Count.parse(sql.count.get(world, mainRoom(world))).n >= max) return "full";
      return open(room, world);
    },
    realm(room, reserve, path) {
      const may = mayRealm(room, reserve);
      if (may !== "ok") return may;
      sql.realm.run(room, path ?? null);
      return open(room, worldOf(room));
    },
    tagRealm(room, path) {
      sql.tag.run(path, room);
    },
    archive(world, name) {
      const room = `${mainRoom(world)}/${name}`;
      const state = stateOf(room);
      if (state === undefined) return "not_found";
      if (state.archived === 0) {
        sql.archive.run(room);
        send("SAMODE", [room, "+m"]);
        send("SAMODE", [room, "+s"]);
      }
      return "archived";
    },
    exists: (room) => stateOf(room) !== undefined,
    archived: (room) => stateOf(room)?.archived === 1,
  };
}
