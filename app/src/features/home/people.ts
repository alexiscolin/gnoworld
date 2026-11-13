// The people online (8i; the hero's "671 ONLINE", "People in 31 countries"): the server's two counts of everyone on the site, logged in or not
// (server/src/worlds/present.ts), read once the page runs. A chunk of its own, asked by peopleCount.ts: the first screen
// holds neither the schema nor the read.
import { PresencePeople, PRESENCE_PEOPLE_MAX_BYTES } from "@gnoworld/schemas/indexer";
import { readPageFile } from "../../lib/query/siteFile.ts";

/** The server's people online, at this site's root. */
export const PEOPLE_URL = "/api/presence/people";

/** The two counts, on the page's fetch; an `Unread` when they did not come whole. */
export const readPeople = (signal: AbortSignal): Promise<PresencePeople> =>
  readPageFile(PEOPLE_URL, PresencePeople, { maxBytes: PRESENCE_PEOPLE_MAX_BYTES, signal });
