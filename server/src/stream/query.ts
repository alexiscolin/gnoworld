// What a stream's request says (stream.ts): a room's name, the rooms asked, the last id a client had, and whether it is counted
// in a world's "here" (D374); each read through its schema, a word given twice refused as one missing.
import { z } from "zod";

// A room's name as the stream and GET /api/verdicts take it: # and one word with no comma, 64 characters at most.
const ROOM = String.raw`#[^\s,#\0-\x1f\x7f]{1,63}`;
/** One room's name, as GET /api/verdicts takes it. */
export const RoomName = z.string().regex(new RegExp(`^${ROOM}$`));

/** A query parameter given exactly once, else none: one given twice is refused as one missing. */
export const once = (values: readonly string[] | undefined): string | undefined =>
  values?.length === 1 ? values[0] : undefined;

// Built at each read, not at import: StrykerJS mutates only what runs inside a test.
const Rooms = () =>
  z
    .string()
    .regex(new RegExp(`^${ROOM}(?:,${ROOM}){0,24}$`))
    .transform((list) => new Set(list.split(",")));
const LastId = () =>
  z
    .string()
    .regex(/^\d{1,15}$/)
    .transform(Number)
    .optional();

// What a stream asks, none for a refusal: its rooms, the last id it had, and whether it goes uncounted in "here": presence=0 once
// (D374); any other word is refused, never read as either.
export function askedOf(req: {
  queries: (key: string) => string[] | undefined;
  header: (key: string) => string | undefined;
}) {
  const rooms = Rooms().safeParse(once(req.queries("rooms")));
  const last = LastId().safeParse(req.header("last-event-id"));
  const presence = req.queries("presence");
  const hidden = presence === undefined ? false : once(presence) === "0" ? true : undefined;
  if (!rooms.success || !last.success || hidden === undefined) return undefined;
  return { rooms: rooms.data, last: last.data ?? 0, hidden };
}
