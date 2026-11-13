// GET and POST /api/unread: the places a page forwards, one account's alone (the account is the session's, never in the body), and each
// world's count of lines past them, 100 at most.
import { RoomId } from "./rooms.ts";
import { Key } from "./slug.ts";
import { z } from "./zod.ts";

/** The places one call forwards at most, and the count a world's pill reaches: a page follows 100 rooms at most. */
export const UNREAD_PLACES_MOST = 100;
export const UNREAD_COUNT_MOST = 100;

/** A call's places: each a room and the time Ergo confirmed as its reading place. */
export const UnreadPlaces = z.strictObject({
  places: z
    .array(z.strictObject({ room: RoomId, time: z.iso.datetime() }))
    .check(z.minLength(1), z.maxLength(UNREAD_PLACES_MOST)),
});
export type UnreadPlaces = z.infer<typeof UnreadPlaces>;

/** Each world's lines past its places: only the worlds that have any. */
export const Unread = z.strictObject({
  worlds: z.record(Key, z.int().check(z.minimum(0), z.maximum(UNREAD_COUNT_MOST))),
});
export type Unread = z.infer<typeof Unread>;
