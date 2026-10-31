// Where a chain's public indexer is (5k): the one place that names an indexer's address, as gnoweb.ts is for gnoweb. The two are
// ADR-0001's own, `indexer.gno.land` and `indexer.onyx.testnets.gno.land` (docs/plans/slice-5-part-2.md, question 4). A field in a
// universe's data would replace INDEXERS with one line (F2952); until Alexis answers, the data holds none, and the CSP's
// connect-src and the realm view both come from here.
const INDEXERS: ReadonlyMap<string, string> = new Map([
  ["gnoland-1", "https://indexer.gno.land/graphql/query"],
  ["onyx-1", "https://indexer.onyx.testnets.gno.land/graphql/query"],
]);

/** A chain's indexer, the address of its GraphQL endpoint, by the chain's id: the two the data names today. */
export function indexerOf(chainId: string): string | undefined {
  return INDEXERS.get(chainId);
}
