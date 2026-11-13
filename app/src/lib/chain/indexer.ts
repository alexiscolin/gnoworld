// The app's read of a realm's facts on the public indexer (slice 5 part 2, 5k) around the chain package's (D112): asked only
// for a realm's name evalCall.ts's grammar passes, the package's read refusing one past its cap, both before anything is asked.
// onyx-1's indexer has no `realmFacts` (F4875): the package reads a realm's facts from its deploy.
import { readFacts } from "@gnoworld/chain/indexer";
import { failedRead, sourceOf, type ChainRead, type ReadOptions } from "@gnoworld/chain/read";
import type { RealmFactsValue } from "@gnoworld/schemas/indexer";
import { isRealmPath } from "./evalCall.ts";

// The name is checked before anything is asked: a bad one is a failed read, not a request.
const checked =
  <V>(read: (indexer: string, path: string, options: ReadOptions) => Promise<ChainRead<V>>) =>
  (indexer: string, path: string, options: ReadOptions = {}): Promise<ChainRead<V>> =>
    isRealmPath(path)
      ? read(indexer, path, options)
      : Promise.resolve(failedRead("bad-name", sourceOf(indexer, options)));

/** A realm's facts from the indexer at `indexer` (its GraphQL address), or why not. */
export const readRealmFacts = checked<RealmFactsValue>(readFacts);
