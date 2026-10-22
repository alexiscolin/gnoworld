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
  const add = db.prepare("INSERT OR IGNORE INTO rooms (name, world, created_at) VALUES (?, ?, ?)");
  for (const world of worlds) add.run(mainRoom(world), world, now);
}

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

/** The world a room belongs to, or none for a room the server never made. */
export function roomWorld(db: DatabaseSync, room: string): string | undefined {
  const World = z.object({ world: z.string() }).optional();
  return World.parse(db.prepare("SELECT world FROM rooms WHERE name = ?").get(room))?.world;
}
