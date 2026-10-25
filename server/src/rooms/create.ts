// A world's further rooms (slice 3's plan, 3l; decisions 147, 162): made by its moderators as
// #<world>/<name>, recorded, joined by the bot and open to accounts (+M); archived, never destroyed:
// read-only (+m) and unlisted (+s), its name and its place in the world's cap kept. The reconciler
// (reconcile.ts, 3m) puts the modes back from what Ergo says, so a room Ergo lost comes back as it was.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Command } from "../irc/lines.ts";
import { mainRoom } from "./rooms.ts";

export const ROOM_STATE = `
ALTER TABLE rooms ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
`;

// Ergo's channellen (deploy/ergo/ircd.yaml.tmpl).
const CHANNEL_MAX = 64;

export interface Rooms {
  create: (world: string, name: string) => { made: string } | "exists" | "full" | "too_long";
  archive: (world: string, name: string) => "archived" | "not_found";
  archived: (room: string) => boolean;
}

interface Options {
  db: DatabaseSync;
  send: (command: Command, params: readonly string[]) => boolean;
  now: () => number;
  // A world's rooms at most, its main room aside, archived ones counted.
  max: number;
}

export function makeRooms({ db, send, now, max }: Options): Rooms {
  const Count = z.object({ n: z.number() });
  const State = z.object({ archived: z.number() }).optional();
  const sql = {
    count: db.prepare("SELECT count(*) AS n FROM rooms WHERE world = ? AND name <> ?"),
    add: db.prepare("INSERT INTO rooms (name, world, created_at) VALUES (?, ?, ?)"),
    // A room's name holds its world's.
    state: db.prepare("SELECT archived FROM rooms WHERE name = ?"),
    archive: db.prepare("UPDATE rooms SET archived = 1 WHERE name = ?"),
  };
  const stateOf = (room: string) => State.parse(sql.state.get(room));
  return {
    create(world, name) {
      const room = `${mainRoom(world)}/${name}`;
      if (room.length > CHANNEL_MAX) return "too_long";
      if (stateOf(room) !== undefined) return "exists";
      if (Count.parse(sql.count.get(world, mainRoom(world))).n >= max) return "full";
      sql.add.run(room, world, now());
      send("JOIN", [room]);
      // Open to accounts, and to all: Ergo makes a room invite-only (+i).
      send("SAMODE", [room, "+M"]);
      send("SAMODE", [room, "-i"]);
      return { made: room };
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
    archived: (room) => stateOf(room)?.archived === 1,
  };
}
