// GET /api/activity?worlds=a,b (slice 3's plan, 3h): each asked world's rooms and their messages a
// minute, kept a few seconds by any cache (ADR-0002, the heat). A world the server does not know is
// absent, not an error; 25 at most, the rail's size. Since 3m, a room is listed to whom may see it, by
// the login's session: the answer to a session is private.
import type { DatabaseSync } from "node:sqlite";
import { type ActivityRooms, type ApiError } from "@gnoworld/schemas";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { worldRooms } from "../rooms/rooms.ts";
import type { Activity } from "./activity.ts";

interface Options {
  db: DatabaseSync;
  now: () => number;
  // Whether an account, or a guest (undefined), sees a room listed: no default, so none is open by mistake.
  visible: (room: string, who: string | undefined) => boolean;
  // The account of a session's token (login.ts's session).
  session?: ((token: string | undefined) => string | undefined) | undefined;
}

export function activityRoutes(activity: Activity, options: Options): Hono {
  const { db, now, visible, session = () => undefined } = options;
  // 25 worlds at most, each a name as the roles file allows it, 64 characters at most.
  const Slug = z
    .string()
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  const Worlds = z
    .string()
    .transform((list) => list.split(","))
    .pipe(z.array(Slug).min(1).max(25));
  const app = new Hono();
  app.get("/", (c) => {
    const asked = c.req.queries("worlds") ?? [];
    const parsed = Worlds.safeParse(asked.length === 1 ? asked[0] : undefined);
    if (!parsed.success) return c.json({ error: "refused" } satisfies ApiError, 400);
    const who = session(getCookie(c, "__Host-session"));
    const rooms = [...new Set(parsed.data)].flatMap((world) =>
      worldRooms(db, world)
        .filter((room) => visible(room, who))
        .map((room) => ({ world, room })),
    );
    const rates = activity.rates(
      rooms.map(({ room }) => room),
      now(),
    );
    c.header("cache-control", `${who === undefined ? "public" : "private"}, max-age=5`);
    return c.json({
      rooms: rooms.map(({ world, room }) => ({ world, room, perMinute: rates.get(room) ?? 0 })),
    } satisfies ActivityRooms);
  });
  return app;
}
