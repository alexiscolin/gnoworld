// A world's last day of messages an hour (8g, frames 26 and 40): the server's history of its rooms (server/src/worlds/present.ts), read once
// the page runs. A chunk of its own, asked by useHours.ts: the first screen holds neither the schema nor the read.
import { PresenceHours, PRESENCE_HOURS_MAX_BYTES } from "@gnoworld/schemas/indexer";
import { readSiteFile, type SiteFileRead } from "../../lib/chain/transport.ts";

/** The hours of `world`, as who is here names it (a hub's slug, "earth"), or none when they did not come whole. */
export const readHours = (world: string, options: SiteFileRead = {}): Promise<PresenceHours | undefined> =>
  readSiteFile(`/api/presence/hours?world=${encodeURIComponent(world)}`, PresenceHours, {
    ...options,
    maxBytes: PRESENCE_HOURS_MAX_BYTES,
  });
