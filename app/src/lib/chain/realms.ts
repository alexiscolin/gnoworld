// The worlds' file (slice-7 §3): the site's own, the server's job writes it from the chain, so its answer passes a size cap and the schema
// before anything reads it. A read that fails is no worlds, never a throw: the cosmos keeps its fixed places and the page its list.
import { Worlds, WORLDS_MAX_BYTES } from "@gnoworld/schemas/indexer";
import { readSiteFile, type SiteFileRead } from "@gnoworld/chain/transport";

/** Under the site's base. */
export const WORLDS_URL = "worlds.json";

/** The file served under `base`, or nothing if it did not come whole. */
export function readWorlds(base: string, options: SiteFileRead = {}): Promise<Worlds | undefined> {
  return readSiteFile(`${base}${WORLDS_URL}`, Worlds, { ...options, maxBytes: WORLDS_MAX_BYTES });
}
