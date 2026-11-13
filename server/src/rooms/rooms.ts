// The rooms the server makes (slice 3's plan, 3h; decision 147): each world of the roles file has its main
// room, the Earth its general one, and no other is made here; a moderator's rooms are 3l's. A room is
// never removed at start: a world gone from the file keeps its history.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

export const ROOM_TABLES = `
CREATE TABLE rooms (name TEXT PRIMARY KEY, world TEXT NOT NULL, created_at INTEGER NOT NULL) STRICT;
CREATE INDEX rooms_by_world ON rooms (world);
`;

export interface Room {
  name: string;
  world: string;
}

/** A world's main room; a moderator's further rooms will be `#<slug>/<room>` (3l). */
export const mainRoom = (slug: string): string => `#${slug}`;

export function ensureRooms(db: DatabaseSync, worlds: readonly string[], now: number): void {
  ensureNamed(
    db,
    worlds.map((world) => ({ name: mainRoom(world), world })),
    now,
  );
}

/** Rooms by name, as the roles file types them (3m): made once, never removed. */
export function ensureNamed(db: DatabaseSync, rooms: readonly Room[], now: number): void {
  const add = db.prepare("INSERT OR IGNORE INTO rooms (name, world, created_at) VALUES (?, ?, ?)");
  for (const { name, world } of rooms) add.run(name, world, now);
}

/** A room's world, from its name: #<world> or #<world>/<name>, as the server and the roles file make them. */
export const worldOf = (room: string): string => room.slice(1).split("/")[0] ?? "";

export function listRooms(db: DatabaseSync): Room[] {
  const Rooms = z.array(z.object({ name: z.string(), world: z.string() }));
  return Rooms.parse(db.prepare("SELECT name, world FROM rooms ORDER BY name").all());
}

export function worldRooms(db: DatabaseSync, world: string): string[] {
  const Names = z.array(z.object({ name: z.string() }));
  return Names.parse(db.prepare("SELECT name FROM rooms WHERE world = ? ORDER BY name").all(world)).map(
    ({ name }) => name,
  );
}

/** A world's rooms with their archived flag (rooms.archived, create.ts's ROOM_STATE), in one query. */
export function worldRoomStates(db: DatabaseSync, world: string): { name: string; archived: boolean }[] {
  const Rows = z.array(z.object({ name: z.string(), archived: z.number() }));
  const sql = "SELECT name, archived FROM rooms WHERE world = ? ORDER BY name";
  return Rows.parse(db.prepare(sql).all(world)).map(({ name, archived }) => ({ name, archived: archived === 1 }));
}

/** The realm path of each of `world`'s realm rooms that has one (create.ts's REALM_PATH). */
export function realmPaths(db: DatabaseSync, world: string): Map<string, string> {
  const Rows = z.array(z.object({ name: z.string(), path: z.string() }));
  const sql =
    "SELECT p.name, p.path FROM realm_rooms p JOIN rooms r ON r.name = p.name WHERE r.world = ? AND p.path IS NOT NULL";
  return new Map(Rows.parse(db.prepare(sql).all(world)).map(({ name, path }) => [name, path]));
}

// Asked for each line the bot checks: its statement and schema made once per database, at its first call.
const lookups = new WeakMap<DatabaseSync, (room: string) => string | undefined>();

/** The world a room belongs to, or none for a room the server never made. */
export function roomWorld(db: DatabaseSync, room: string): string | undefined {
  const known = lookups.get(db);
  if (known !== undefined) return known(room);
  const World = z.object({ world: z.string() }).optional();
  const sql = db.prepare("SELECT world FROM rooms WHERE name = ?");
  const lookup = (name: string): string | undefined => World.parse(sql.get(name))?.world;
  lookups.set(db, lookup);
  return lookup(room);
}
