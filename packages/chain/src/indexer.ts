// The one read of the public indexer (slice 5 part 2, 5k; D112): a realm's facts, through `readChain` and a Zod schema, one
// GET of an https address with the limits of read.ts, a source and a time on every result, no polling. THE WIRE IS A GUESS (F2950):
// gnomcp shows no raw GraphQL, gnoland-1's indexer timed out, and both indexers have no time field (recorded/indexer-errors.txt).
// So every fact from it must carry its age as a block height, and no chart by date may stand on it (the calls in 24 h wait on an indexer with dates: F2974).
import { RealmFactsAnswer, REALM_FACTS_CAPS, type RealmFactsValue } from "@gnoworld/schemas/indexer";
import { failedRead, readChain, sourceOf, type ChainRead, type ReadOptions } from "./read.ts";

const FACTS_QUERY = "query($path: String!) { realmFacts(path: $path) { path deployer firstBlock } }";

/** A realm's facts from the indexer at `indexer` (its GraphQL address), for a path its caller checked, or why not. */
export async function readFacts(
  indexer: string,
  path: string,
  options: ReadOptions = {},
): Promise<ChainRead<RealmFactsValue>> {
  // A name past the cap is refused before anything is asked.
  if (path.length > REALM_FACTS_CAPS.path) return failedRead("bad-name", sourceOf(indexer, options));
  const asked = `${indexer}?query=${encodeURIComponent(FACTS_QUERY)}&variables=${encodeURIComponent(JSON.stringify({ path }))}`;
  const answer = await readChain(asked, RealmFactsAnswer, options);
  if (!answer.ok) return answer;
  const facts = answer.value.data.realmFacts;
  if (facts === null) return failedRead("no-realm", answer.source);
  // An answer about another realm than the one asked is not this realm's facts.
  if (facts.path !== undefined && facts.path !== path) return failedRead("wrong-shape", answer.source);
  return { ok: true, value: facts, source: answer.source };
}
