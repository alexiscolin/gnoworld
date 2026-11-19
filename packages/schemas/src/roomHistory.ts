// GET /api/history?room=: a public room's last lines, so a page draws them before its IRC link has joined. A line is
// what core's `Line` holds of a plain message (never a reply, an edit or a reaction); the page replaces them with Ergo's.
import { RoomId } from "./rooms.ts";
import { z } from "./zod.ts";

/** The lines an answer holds at most. */
export const ROOM_HISTORY_LINES = 50;

const HistoryLine = z.strictObject({
  id: z.string().check(z.minLength(1), z.maxLength(128)),
  /** Ergo's server-time form: 2026-10-25T10:00:00.000Z. */
  time: z.iso.datetime(),
  from: z.string().check(z.minLength(1), z.maxLength(64)),
  /** The account behind the line; none for a guest's. */
  account: z.optional(z.string().check(z.minLength(1), z.maxLength(64))),
  text: z.string().check(z.minLength(1)),
});

export const RoomHistory = z.strictObject({
  room: RoomId,
  lines: z.array(HistoryLine).check(z.maxLength(ROOM_HISTORY_LINES)),
});
export type RoomHistory = z.infer<typeof RoomHistory>;
