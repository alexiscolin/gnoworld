// The worlds' count (7n2), this site's own file beside the worlds' file: the home's hero reads it for its number, a few bytes, so a phone asks
// nothing of the cosmos before View in space. Apart from realms.ts, so the first screen takes none of the worlds' file's schema.
import { WORLDS_COUNT_MAX_BYTES, WorldsCount } from "@gnoworld/schemas";
import { readSiteFile, type SiteFileRead } from "./transport.ts";

/** Under the site's base, beside the worlds' file. */
export const WORLDS_COUNT_URL = "worlds-count.json";

/** The count served under `base`, or nothing if it did not come whole. */
export function readWorldsCount(base: string, options: SiteFileRead = {}): Promise<WorldsCount | undefined> {
  return readSiteFile(`${base}${WORLDS_COUNT_URL}`, WorldsCount, { ...options, maxBytes: WORLDS_COUNT_MAX_BYTES });
}
