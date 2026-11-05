// What the server asks a universe's public indexer for the chain's rooms (slice 9g), the indexer's GraphQL being this package's
// alone (D113). Checked against the live schema of the Onyx indexer on 2026-11-06 (introspection): `FilterInt` has eq, gt, lt;
// `TransactionOrder` has heightAndIndex; the subscription's and the query's `where` are one filter, and the subscription's
// `where` is required, so a block's is empty. What a transaction asks for holds no args, no memo and no events.
const TX_FIELDS =
  "hash block_height success messages { value { __typename ... on MsgCall { caller pkg_path func } ... on MsgAddPackage { creator package { path } } } }";

/** The transactions the rooms need: the calls to these realms and every deploy, that succeeded; the filter lets other messages of the same transaction through, so each is checked again on reading. */
function whereOf(realms: Iterable<string>, bound = ""): string {
  const calls = [...realms].map(
    (realm) => `{ messages: { value: { MsgCall: { pkg_path: { eq: ${JSON.stringify(realm)} } } } } }`,
  );
  const deploys = `{ messages: { typeUrl: { eq: "add_package" } } }`;
  return `{ success: { eq: true }, ${bound}_or: [${[deploys, ...calls].join(", ")}] }`;
}

/** The two subscriptions of a universe: its transactions, and its blocks (a block carries its time, a transaction none). */
export const subscriptionsOf = (realms: Iterable<string>): { id: string; query: string }[] => [
  { id: "tx", query: `subscription { getTransactions(where: ${whereOf(realms)}) { ${TX_FIELDS} } }` },
  { id: "blocks", query: "subscription { getBlocks(where: {}) { height time } }" },
];

/** A page of these realms' transactions from a block on (that block included), oldest first. */
export const catchUpQuery = (realms: Iterable<string>, from: number, limit: number): string =>
  `{ getTransactions(where: ${whereOf(realms, `block_height: { gt: ${String(from - 1)} }, `)}, order: { heightAndIndex: ASC }, limit: ${String(limit)}) { ${TX_FIELDS} } }`;

/** A page of the deploys, newest first, from the block below `before` (none: the newest). */
export const deploysQuery = (before: number | undefined, limit: number): string =>
  `{ getTransactions(where: { success: { eq: true }, ${before === undefined ? "" : `block_height: { lt: ${String(before)} }, `}_or: [{ messages: { typeUrl: { eq: "add_package" } } }] }, order: { heightAndIndex: DESC }, limit: ${String(limit)}) { ${TX_FIELDS} } }`;

/** The height and time of these blocks. */
export const blocksQuery = (heights: readonly number[]): string =>
  `{ getBlocks(where: { _or: [${heights.map((height) => `{ height: { eq: ${String(height)} } }`).join(", ")}] }, limit: ${String(heights.length)}) { height time } }`;
