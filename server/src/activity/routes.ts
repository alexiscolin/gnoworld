// GET /api/activity?worlds=a,b (slice 3's plan, 3h): each asked world's rooms and their messages a
// minute, public and kept a few seconds by any cache (ADR-0002, the heat). A world the server does not
// know is absent, not an error; 25 at most, the rail's size.
import type { DatabaseSync } from "node:sqlite";
import { type ActivityRooms, type ApiError } from "@gnoworld/schemas";
import { Hono } from "hono";
import { z } from "zod";
import { worldRooms } from "../rooms/rooms.ts";
import type { Activity } from "./activity.ts";

export function activityRoutes(activity: Activity, { db, now }: { db: DatabaseSync; now: () => number }): Hono {
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
    const rooms = [...new Set(parsed.data)].flatMap((world) => worldRooms(db, world).map((room) => ({ world, room })));
    const rates = activity.rates(
      rooms.map(({ room }) => room),
      now(),
    );
    c.header("cache-control", "public, max-age=5");
    return c.json({
      rooms: rooms.map(({ world, room }) => ({ world, room, perMinute: rates.get(room) ?? 0 })),
    } satisfies ActivityRooms);
  });
  return app;
}
