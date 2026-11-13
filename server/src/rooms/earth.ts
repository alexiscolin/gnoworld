// The Earth's public rooms (D394): how many lines each says in a day, which have gone quiet, and the sweep that archives them.
// A line is a verdict row (moderation/check.ts), a hidden one no line; the verdicts keep 180 days, past the 14 a room is spared.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Rooms } from "./create.ts";
import type { Typed } from "./types.ts";

// A guest's relayed line leaves no verdict (D430): the lines said in a room each hour, upserted by each relayed line, so a room only
// guests speak in is neither swept nor shown as silent. The retention keeps 25 hours and each room's latest hour.
export const ROOM_SAID = `
CREATE TABLE room_said (room TEXT NOT NULL, hour INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (room, hour)) STRICT;
`;

const HOUR_MS = 60 * 60_000;
/** The hour a time falls in, as room_said counts them. */
const hourOf = (at: number): number => Math.floor(at / HOUR_MS);

/** Counts one relayed line in a room's hour. */
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

/** The lines each room says since `since`, hidden ones left out, as one pass over the verdicts' time index. */
export function roomCounts(db: DatabaseSync, since: number): Map<string, number> {
  const Rows = z.array(z.object({ room: z.string(), n: z.number() }));
  const rows = Rows.parse(
    db
      .prepare("SELECT room, count(*) AS n FROM verdicts WHERE at > ? AND action <> 'hide' GROUP BY room ORDER BY room")
      .all(since),
  );
  const counts = new Map(rows.map(({ room, n }) => [room, n]));
  // A guest's lines, by the hour that holds `since`: a line exactly at it counts, one up to an hour before may too.
  const guests = Rows.parse(
    db
      .prepare("SELECT room, sum(n) AS n FROM room_said WHERE hour >= ? GROUP BY room ORDER BY room")
      .all(hourOf(since)),
  );
  for (const { room, n } of guests) counts.set(room, (counts.get(room) ?? 0) + n);
  return new Map([...counts].sort(([a], [b]) => (a < b ? -1 : 1)));
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
    [
      ...Rooms.parse(db.prepare("SELECT DISTINCT room FROM verdicts WHERE at >= ? AND action <> 'hide'").all(cutoff)),
      ...Rooms.parse(db.prepare("SELECT DISTINCT room FROM room_said WHERE hour >= ?").all(hourOf(cutoff))),
    ].map(({ room }) => room),
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
