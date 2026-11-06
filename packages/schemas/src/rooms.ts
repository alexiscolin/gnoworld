// A room a world's moderator makes (slice 3's plan, 3l): its name a slug of [a-z0-9] and single hyphens,
// 32 characters at most; the server makes it as #<world>/<name>, so it is never a world's main room.
import { Slug } from "./slug.ts";
import { z } from "./zod.ts";

export const RoomName = Slug.check(z.maxLength(32));

export const CreateRoom = z.strictObject({ world: Slug, name: RoomName });
export type CreateRoom = z.infer<typeof CreateRoom>;

/** A room as the server and Ergo name it: #<world>, a world's main room, or #<world>/<name>; 64 characters at most. */
export const RoomId = z
  .string()
  .check(z.maxLength(64), z.regex(/^#[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)?$/));

// F671: the room made, read by the client as a room's id.
export const MadeRoom = z.strictObject({ room: RoomId });
export type MadeRoom = z.infer<typeof MadeRoom>;

export const RoomType = z.enum(["open", "announcement", "accounts", "members", "members-write"]);

/** A world's rooms a reader may see, in the sections its moderators set (roles file, 50 at most), then a
 * section named null for the rest: 51 sections, 500 rooms each. */
export const RoomList = z.object({
  world: Slug,
  sections: z
    .array(
      z.object({
        name: z.nullable(z.string().check(z.minLength(1), z.maxLength(64))),
        rooms: z.array(z.object({ room: RoomId, type: RoomType })).check(z.maxLength(500)),
      }),
    )
    .check(z.maxLength(51)),
});
export type RoomList = z.infer<typeof RoomList>;
