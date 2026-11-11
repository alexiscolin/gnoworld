// Tier 1 (docs/REVIEW.md). A room's namespace from the server's own tables, never from a request: the realm a realm's room was made for (its
// path's second segment), or, for a hub's main room, the namespace of the hub's first realm. The Earth, a room with no path and any other
// room have none, so no owner is read for them.
import type { DatabaseSync } from "node:sqlite";
import { REALM_PREFIX } from "@gnoworld/core";
import { z } from "zod";
import { mainRoom } from "../rooms/rooms.ts";

/** `hubs` is `hubWorlds`: each hub's slug with its first realm's world id, a world id being `<namespace>/<folder>`. */
export function namespaceFinder(
  db: DatabaseSync,
  hubs: ReadonlyMap<string, string>,
): (room: string) => string | undefined {
  const Row = z.object({ path: z.string().nullable() }).optional();
  const path = db.prepare("SELECT path FROM realm_rooms WHERE name = ?");
  const mains = new Map([...hubs].map(([slug, world]) => [mainRoom(slug), world.split("/")[0]]));
  return (room) => {
    const held = Row.parse(path.get(room))?.path;
    if (held?.startsWith(REALM_PREFIX) === true) {
      const namespace = held.slice(REALM_PREFIX.length).split("/")[0];
      return namespace === "" ? undefined : namespace;
    }
    return held === undefined || held === null ? mains.get(room) : undefined;
  };
}
