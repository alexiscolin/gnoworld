// A world's last day of messages an hour (8g, frames 26 and 40): the server's history of its rooms (server/src/worlds/present.ts), read once
// the page runs. A chunk of its own, asked by useHours.ts: the first screen holds neither the schema nor the read.
import { PresenceHours, PRESENCE_HOURS_MAX_BYTES } from "@gnoworld/schemas/indexer";
import { readPageFile } from "../../lib/query/siteFile.ts";

/** The hours of `world`, as who is here names it (a hub's slug, "earth"), on the page's fetch; an `Unread` when they did not come whole. */
export const readHours = (world: string, signal: AbortSignal): Promise<PresenceHours> =>
  readPageFile(`/api/presence/hours?world=${encodeURIComponent(world)}`, PresenceHours, {
    maxBytes: PRESENCE_HOURS_MAX_BYTES,
    signal,
  });
