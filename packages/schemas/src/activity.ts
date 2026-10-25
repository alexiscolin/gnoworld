// How busy each room is, as the server answers it (slice 3's plan, 3h): each asked world's rooms and
// their messages a minute, over the last five minutes.
import { z } from "./zod.ts";

export const ActivityRooms = z.object({
  rooms: z.array(z.object({ world: z.string(), room: z.string(), perMinute: z.number().nonnegative() })),
});
export type ActivityRooms = z.infer<typeof ActivityRooms>;
