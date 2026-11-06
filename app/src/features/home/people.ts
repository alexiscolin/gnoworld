// The people online (8i; the hero's "671 ONLINE", "People in 31 countries"): the server's two counts of who the relay holds in the rooms a
// guest may see (server/src/worlds/present.ts), read once the page runs. A chunk of its own, asked by peopleCount.ts: the first screen
// holds neither the schema nor the read.
import { PresencePeople, PRESENCE_PEOPLE_MAX_BYTES } from "@gnoworld/schemas/indexer";
import { readSiteFile, type SiteFileRead } from "@gnoworld/chain/transport";

/** The server's people online, at this site's root. */
export const PEOPLE_URL = "/api/presence/people";

/** The two counts, or none when they did not come whole. */
export const readPeople = (options: SiteFileRead = {}): Promise<PresencePeople | undefined> =>
  readSiteFile(PEOPLE_URL, PresencePeople, { ...options, maxBytes: PRESENCE_PEOPLE_MAX_BYTES });
