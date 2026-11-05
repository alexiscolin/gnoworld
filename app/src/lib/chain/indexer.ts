// The app's read of a realm's facts on the public indexer (slice 5 part 2, 5k) around the chain package's (D112): asked only
// for a realm's name evalCall.ts's grammar passes, the package's read refusing one past its cap, both before anything is asked.
import { readFacts } from "@gnoworld/chain/indexer";
import { failedRead, sourceOf, type ChainRead, type ReadOptions } from "@gnoworld/chain/read";
import type { RealmFactsValue } from "@gnoworld/schemas/indexer";
import { isRealmPath } from "./evalCall.ts";

/** A realm's facts from the indexer at `indexer` (its GraphQL address), or why not. */
export function readRealmFacts(
  indexer: string,
  path: string,
  options: ReadOptions = {},
): Promise<ChainRead<RealmFactsValue>> {
  if (!isRealmPath(path)) return Promise.resolve(failedRead("bad-name", sourceOf(indexer, options)));
  return readFacts(indexer, path, options);
}
