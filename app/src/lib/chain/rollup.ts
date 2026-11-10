// A realm's rollup file (slice 13a), served beside the worlds' file under the hash of the realm's path (core's rollupName): the site's own, so its
// answer passes a size cap and the schema before anything reads it. A read that fails is no rollup, never a throw: the plate leaves its calls blocks out.
import { rollupName } from "@gnoworld/core";
import { RealmRollup } from "@gnoworld/schemas/indexer";
import { readSiteFile, type SiteFileRead } from "@gnoworld/chain/transport";

/** The most bytes read: the job holds a file under 8 KB gzipped, so this is far past any honest one. */
const ROLLUP_MAX_BYTES = 256 * 1024;

/** The rollup of `realm` served under `base`, or nothing if it did not come whole. */
export function readRollup(base: string, realm: string, options: SiteFileRead = {}): Promise<RealmRollup | undefined> {
  return readSiteFile(`${base}rollups/${rollupName(realm)}.json`, RealmRollup, {
    ...options,
    maxBytes: ROLLUP_MAX_BYTES,
  });
}
