// A room a world's moderator makes (slice 3's plan, 3l): its name a slug of [a-z0-9] and single hyphens,
// 32 characters at most; the server makes it as #<world>/<name>, so it is never a world's main room.
import { z } from "zod";

const Slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export const RoomName = Slug.max(32);

export const CreateRoom = z.strictObject({ world: Slug, name: RoomName });
export type CreateRoom = z.infer<typeof CreateRoom>;

export const MadeRoom = z.strictObject({ room: z.string() });
export type MadeRoom = z.infer<typeof MadeRoom>;
