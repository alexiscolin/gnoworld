// A world's last day of messages an hour (slice 8, 8g; a plate's "ACTIVITY · LAST 24 H", frames 26 and 40), from the history who is here
// keeps (presence.ts, 7t3): its busiest sample of each hour, an hour no sample read null, and its pace now. Served at GET
// /api/presence/hours?world= beside who is here (present.ts); counts alone.
import { HubSlug, PRESENCE_HOURS, type PresenceHours } from "@gnoworld/schemas/indexer";
import type { Hono } from "hono";

const HOUR = 3_600_000;

// A world's last day of messages an hour, its current hour last, from its kept samples, and its pace now; no hours when none was kept.
export function hoursOf(
  slots: readonly { at: number; people: number }[],
  now: number | null,
  at: number,
): PresenceHours {
  const from = Math.floor(at / HOUR) * HOUR - (PRESENCE_HOURS - 1) * HOUR;
  const kept = new Map(slots.map((slot) => [slot.at, slot.people]));
  const hours = Array.from({ length: PRESENCE_HOURS }, (_, index) => kept.get(from + index * HOUR) ?? null);
  return { from, hours: hours.every((hour) => hour === null) ? [] : hours, now };
}

// GET /hours?world=: a world's hours, as who is here names it (its roles file's slug); any other name is refused.
export function hoursRoute(routes: Hono, hours: (world: string) => PresenceHours): void {
  routes.get("/hours", (c) => {
    const world = HubSlug.safeParse(c.req.query("world"));
    if (!world.success) return c.json({ error: "refused" }, 400);
    c.header("cache-control", "public, max-age=60");
    return c.json(hours(world.data));
  });
}
