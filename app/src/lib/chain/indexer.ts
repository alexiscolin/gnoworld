// The browser's one read of the public indexer (slice 5 part 2, 5k): a realm's facts, through `readChain` and a Zod schema, nothing
// else. One GET of an https address, a time limit and a size cap from read.ts, a source and a time on every result, and no
// polling. THE WIRE IS A GUESS (ledger F2950): the GraphQL query text, whether the indexer takes a GET, and whether a browser may
// call it (CORS) are unknown until a gnomcp session records one; a service that cannot be called is a `down` with its next step.
import { RealmFactsAnswer, REALM_FACTS_CAPS, type RealmFactsValue } from "@gnoworld/schemas";
import { isRealmPath } from "./evalCall.ts";
import { failedRead, readChain, sourceOf, type ChainRead, type ReadOptions } from "./read.ts";

const FACTS_QUERY = "query($path: String!) { realmFacts(path: $path) { path deployer firstBlock callsPerDay } }";

/** A realm's facts from the indexer at `indexer` (its GraphQL address), or why not. */
export async function readRealmFacts(
  indexer: string,
  path: string,
  options: ReadOptions = {},
): Promise<ChainRead<RealmFactsValue>> {
  // A bad name is refused before anything is asked.
  if (!isRealmPath(path) || path.length > REALM_FACTS_CAPS.path)
    return failedRead("bad-name", sourceOf(indexer, options));
  const asked = `${indexer}?query=${encodeURIComponent(FACTS_QUERY)}&variables=${encodeURIComponent(JSON.stringify({ path }))}`;
  const answer = await readChain(asked, RealmFactsAnswer, options);
  if (!answer.ok) return answer;
  const facts = answer.value.data.realmFacts;
  return facts === null ? failedRead("no-realm", answer.source) : { ok: true, value: facts, source: answer.source };
}
