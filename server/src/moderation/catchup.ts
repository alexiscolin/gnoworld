// Where the bot stopped in each room (ADR-0002 §6; slice 3's plan, 3j): the time of the last line of a run
// settled in the order heard, so after an outage or a restart it asks Ergo for what came after, a line still
// waiting on its check included, and the verdicts' key checks each once. A time, not a msgid: Ergo answers
// nothing after a msgid it no longer holds, and a hidden line is gone from its history.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

export const PROGRESS_TABLES = `
CREATE TABLE progress (room TEXT PRIMARY KEY, time TEXT NOT NULL) STRICT;
`;

interface Line {
  room: string;
  msgid: string;
  time?: string;
}

export interface Progress {
  // The mark, or the time of the first line still waiting when the room has none yet.
  last: (room: string) => string | undefined;
  // A line handed to the check, in the order it came.
  heard: (line: Line) => void;
  // A line checked, seen before or dropped: the mark moves past each line settled in a row.
  settled: (line: Line) => void;
  // The rooms and the lines it holds, for the tests of its bound.
  size: () => { rooms: number; lines: number };
}

export function makeProgress(db: DatabaseSync): Progress {
  const Row = z.object({ time: z.string() }).optional();
  const sql = {
    last: db.prepare("SELECT time FROM progress WHERE room = ?"),
    mark: db.prepare(
      "INSERT INTO progress (room, time) VALUES (?, ?) ON CONFLICT (room) DO UPDATE SET time = excluded.time",
    ),
  };
  // Each room's lines not yet behind the mark, in the order heard: whether each is settled, and its time.
  // ponytail: the order heard, not Ergo's: a live line heard before a page of older history moves the mark
  // past that page's lines while they wait, lost if the process dies then. Order by Ergo's time if it matters.
  const open = new Map<string, Map<string, { done: boolean; time: string | undefined }>>();
  return {
    last: (room) =>
      Row.parse(sql.last.get(room))?.time ??
      [...(open.get(room)?.values() ?? [])].find(({ time }) => time !== undefined)?.time,
    heard: ({ room, msgid, time }) => {
      const lines = open.get(room) ?? new Map<string, { done: boolean; time: string | undefined }>();
      open.set(room, lines.set(msgid, { done: false, time }));
    },
    settled: ({ room, msgid }) => {
      const lines = open.get(room);
      const line = lines?.get(msgid);
      if (lines === undefined || line === undefined) return;
      line.done = true;
      let mark: string | undefined;
      for (const [id, { done, time }] of lines) {
        if (!done) break;
        mark = time ?? mark;
        lines.delete(id);
      }
      if (lines.size === 0) open.delete(room);
      if (mark !== undefined) sql.mark.run(room, mark);
    },
    size: () => ({ rooms: open.size, lines: [...open.values()].reduce((sum, lines) => sum + lines.size, 0) }),
  };
}
