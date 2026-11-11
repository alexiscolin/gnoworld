// A room a world's moderator makes (slice 3's plan, 3l): its name a slug of [a-z0-9] and single hyphens,
// 32 characters at most; the server makes it as #<world>/<name>, so it is never a world's main room.
import { PEOPLE_MOST, PER_HOUR_MOST } from "./counts.ts";
import { RealmPath } from "./realmPath.ts";
import { Slug } from "./slug.ts";
import { z } from "./zod.ts";

export const RoomName = Slug.check(z.maxLength(32));

export const CreateRoom = z.strictObject({ world: Slug, name: RoomName });
export type CreateRoom = z.infer<typeof CreateRoom>;

/** A room as the server and Ergo name it: #<world>, a world's main room, or #<world>/<name>; 64 characters at most. */
export const RoomId = z
  .string()
  .check(z.maxLength(64), z.regex(/^#[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)?$/));

/** POST /api/rooms/realm's body (D390): the realm a room is asked for, by its path. */
export const RealmRoomRequest = z.strictObject({ path: RealmPath });
export type RealmRoomRequest = z.infer<typeof RealmRoomRequest>;

// F671: the room made, read by the client as a room's id.
export const MadeRoom = z.strictObject({ room: RoomId });
export type MadeRoom = z.infer<typeof MadeRoom>;

export const RoomType = z.enum(["open", "announcement", "accounts", "members", "members-write"]);

/** A room as listed: its type, and (D394) the people in it now and the lines it had in 24 hours, each left out when zero or unknown. */
const ListedRoom = z.object({
  room: RoomId,
  type: RoomType,
  here: z.optional(z.int().check(z.minimum(0), z.maximum(PEOPLE_MOST))),
  messages: z.optional(z.int().check(z.minimum(0), z.maximum(PER_HOUR_MOST))),
  /** A realm's room: the realm it is for, so the room links to its page (a hash is all its name holds of it). */
  realm: z.optional(RealmPath),
});

/** A world's rooms a reader may see, in the sections its moderators set (roles file, 50 at most), then a
 * section named null for the rest: 51 sections, 1,100 rooms each (the Earth's thousand public rooms and the moderators' 20). */
export const RoomList = z.object({
  world: Slug,
  sections: z
    .array(
      z.object({
        name: z.nullable(z.string().check(z.minLength(1), z.maxLength(64))),
        rooms: z.array(ListedRoom).check(z.maxLength(1_100)),
      }),
    )
    .check(z.maxLength(51)),
});
export type RoomList = z.infer<typeof RoomList>;
