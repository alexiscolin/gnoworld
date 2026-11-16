// The Earth's public rooms: how many lines each says in a day, which have gone quiet, and the sweep that archives them.
// A line is counted in room_said as it passes (moderation/check.ts, a guest's relayed line too), a hidden one no line: the verdicts
// are capped (retention's maxVerdicts), so they are no record of a room's lines.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Rooms } from "./create.ts";
import type { Typed } from "./types.ts";

// The lines said in a room each hour, upserted by each line that passes (an account's, counted by the checker) or is relayed (a
// guest's). The retention keeps 25 hours and each room's latest hour.
export const ROOM_SAID = `
CREATE TABLE room_said (room TEXT NOT NULL, hour INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (room, hour)) STRICT;
`;

// Until room_said counted accounts' lines too it held guests' alone, accounts' past lines being in the verdicts: add them, by the
// hour as hourOf computes it, to what a guest left there (F13501). A hidden line is none.
export const ROOM_SAID_BACKFILL = `
INSERT INTO room_said (room, hour, n)
SELECT room, at / 3600000, count(*) FROM verdicts WHERE action <> 'hide' GROUP BY room, at / 3600000
ON CONFLICT (room, hour) DO UPDATE SET n = n + excluded.n;
`;

const HOUR_MS = 60 * 60_000;
/** The hour a time falls in, as room_said counts them. */
const hourOf = (at: number): number => Math.floor(at / HOUR_MS);

/** Counts one line in a room's hour. */
export function guestSaid(db: DatabaseSync): (room: string, at: number) => void {
  const add = db.prepare(
    "INSERT INTO room_said (room, hour, n) VALUES (?, ?, 1) ON CONFLICT (room, hour) DO UPDATE SET n = n + 1",
  );
  return (room, at) => {
    add.run(room, hourOf(at));
  };
}

/** A public room nobody writes in for this long is archived. */
const IDLE_MS = 14 * 24 * 60 * 60_000;

/** The lines each room says since `since`, hidden ones left out, by the hour that holds `since`: a line exactly at it counts, one up to an hour before may too. */
export function roomCounts(db: DatabaseSync, since: number): Map<string, number> {
  const Rows = z.array(z.object({ room: z.string(), n: z.number() }));
  const rows = Rows.parse(
    db
      .prepare("SELECT room, sum(n) AS n FROM room_said WHERE hour >= ? GROUP BY room ORDER BY room")
      .all(hourOf(since)),
  );
  return new Map(rows.map(({ room, n }) => [room, n]));
}

/** The live public rooms made before `cutoff` with no line since it. A moderator's room is never one. */
export function idleRooms(db: DatabaseSync, cutoff: number): string[] {
  const Names = z.array(z.object({ name: z.string() }));
  const made = Names.parse(
    db
      .prepare(
        "SELECT e.name FROM earth_rooms e JOIN rooms r ON r.name = e.name WHERE r.archived = 0 AND e.created_at < ? ORDER BY e.name",
      )
      .all(cutoff),
  );
  const Rooms = z.array(z.object({ room: z.string() }));
  const spoken = new Set(
    Rooms.parse(db.prepare("SELECT DISTINCT room FROM room_said WHERE hour >= ?").all(hourOf(cutoff))).map(
      ({ room }) => room,
    ),
  );
  return made.map(({ name }) => name).filter((name) => !spoken.has(name));
}

/** Archives the idle public rooms, but those the roles file has since given a place (`reserved`); the rooms it archived. */
export function sweepIdle(
  db: DatabaseSync,
  rooms: Pick<Rooms, "archive">,
  { now, reserved }: { now: number; reserved: (room: string) => boolean },
): string[] {
  const idle = idleRooms(db, now - IDLE_MS).filter((room) => !reserved(room));
  for (const room of idle) rooms.archive("earth", room.slice("#earth/".length));
  return idle;
}

/** Whether the roles file gives a room of the Earth a place, typed or in a section: the file's even before anyone made it. */
export function reservedOnEarth(roles: Typed, room: string): boolean {
  const earth = roles.worlds.get("earth");
  return earth?.rooms?.has(room) === true || earth?.sections?.some(({ rooms }) => rooms.includes(room)) === true;
}
