// A fake public indexer for the chain's tests (slice 9g): it answers the queries the server really sends (packages/chain's
// transactions.ts) by reading their words: the tip, the rows after a place up to a tip bound, a page's size, a row's place alone,
// the time of a block. The realms' filter is not evaluated: the rows it holds are the matching ones.
export interface FakeRow {
  height: number;
  index: number;
  row: Record<string, unknown>;
}

export interface FakeIndexer {
  /** The newest block. */
  tip: () => number;
  /** The rows the filter would give, in order. */
  rows: () => FakeRow[];
}

const number = (query: string, pattern: RegExp): number | undefined => {
  const found = pattern.exec(query)?.[1];
  return found === undefined ? undefined : Number(found);
};

/** `send`'s body for the server: the fake's answer to one query. */
export function answerOf(indexer: FakeIndexer, query: string): Response {
  const answer = (data: unknown): Response => new Response(JSON.stringify({ data }));
  if (query.includes("latestBlockHeight")) return answer({ latestBlockHeight: indexer.tip() });
  if (query.includes("getBlocks")) {
    const heights = [...query.matchAll(/height: \{ eq: (\d+) \}/g)].map(([, height = ""]) => Number(height));
    return answer({ getBlocks: heights.map((height) => ({ height, time: "2026-11-05T04:00:00Z" })) });
  }
  const bound = number(query, /block_height: \{ lt: (\d+) \}/) ?? Number.POSITIVE_INFINITY;
  const gt = number(query, /\{ block_height: \{ gt: (\d+) \} \}/) ?? -1;
  const same = number(query, /block_height: \{ eq: (\d+) \}, index: \{ gt: \d+ \}/);
  const after = number(query, /block_height: \{ eq: \d+ \}, index: \{ gt: (\d+) \}/) ?? -1;
  const limit = number(query, /limit: (\d+)\)/) ?? 0;
  const rows = indexer
    .rows()
    .filter(({ height, index }) => height < bound && (height > gt || (height === same && index > after)))
    .slice(0, limit);
  const place = query.includes("{ block_height index } }");
  return answer({
    getTransactions: rows.map((each) => (place ? { block_height: each.height, index: each.index } : each.row)),
  });
}
