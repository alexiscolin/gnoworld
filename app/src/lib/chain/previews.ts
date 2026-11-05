// The preview captures' file (8f): the site's own, the server's job writes it from a chain, so its answer passes a size cap and the schema
// before anything reads it. A read that fails is no capture, never a throw: no capture, no preview.
import { Previews, PREVIEWS_MAX_BYTES } from "@gnoworld/schemas/indexer";
import { readSiteFile, type SiteFileRead } from "@gnoworld/chain/transport";

/** Under the site's base. */
export const PREVIEWS_URL = "previews.json";

/** The file served under `base`, or nothing if it did not come whole. */
export function readPreviews(base: string, options: SiteFileRead = {}): Promise<Previews | undefined> {
  return readSiteFile(`${base}${PREVIEWS_URL}`, Previews, { ...options, maxBytes: PREVIEWS_MAX_BYTES });
}
