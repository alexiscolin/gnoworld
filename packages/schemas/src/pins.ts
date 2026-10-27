// A room's pins (slice 4's 4d): GET /api/pins's answer and the body of POST /api/pins. A pin is the line as Ergo held
// it when a moderator pinned it, read by the server from Ergo; a request names the room and the line's id alone.
import { Address } from "./address.ts";
import { RoomId } from "./rooms.ts";
import { StreamEvent } from "./stream.ts";
import { z } from "./zod.ts";

/** The pins a room holds at most. */
export const PINS_MAX = 10;

/** A line's msgid as a pin names it: one word, no comma, no control character, at most 128 characters. */
export const PinId = StreamEvent.shape.msgid.check(z.regex(/^[^\s,\0-\x1f\x7f]+$/));

/** A time as Ergo writes it: ISO 8601, to the millisecond. */
export const Time = z.iso.datetime({ precision: 3 });

/** A pinned line: its id, Ergo's time, its author's account and its text, a message's 510 characters at most. */
export const PinnedLine = z.strictObject({
  id: PinId,
  time: Time,
  account: Address,
  text: z.string().check(z.minLength(1), z.maxLength(510)),
});
export type PinnedLine = z.infer<typeof PinnedLine>;

/** A room's pins, the newest pinned first, and whether the reader may pin and unpin there. */
export const PinList = z.strictObject({
  room: RoomId,
  may: z.boolean(),
  pins: z.array(PinnedLine).check(z.maxLength(PINS_MAX)),
});
export type PinList = z.infer<typeof PinList>;

/** What a page sends to pin or unpin: a room and a line's id, never the line. */
export const PinRequest = z.strictObject({ room: RoomId, msgid: PinId });
export type PinRequest = z.infer<typeof PinRequest>;
