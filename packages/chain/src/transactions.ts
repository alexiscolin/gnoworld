// What the server asks a universe's public indexer for the chain's rooms, the indexer's GraphQL being this package's
// alone. From the Onyx indexer's live schema (introspection): `FilterInt` has eq, gt, lt; `TransactionOrder` has
// heightAndIndex. That `index` filters as a FilterInt and that `_and` takes a list is read from the indexer's README, not from
// a live query. What a transaction asks for holds no args, no memo and no events.
const TX_FIELDS =
  "hash block_height index success messages { value { __typename ... on MsgCall { caller pkg_path func } ... on MsgAddPackage { creator package { path } } } }";
const PLACE_FIELDS = "block_height index";

/** A transaction's place, `(height, index)`; without an index, every row of that block was read. */
export interface Place {
  height: number;
  index?: number;
}

/** The transactions the rooms need: the calls to these realms and every deploy, that succeeded; the filter lets other messages of the same transaction through, so each is checked again on reading. */
function realmsOf(realms: Iterable<string>): string {
  const calls = [...realms].map(
    (realm) => `{ messages: { value: { MsgCall: { pkg_path: { eq: ${JSON.stringify(realm)} } } } } }`,
  );
  const deploys = `{ messages: { typeUrl: { eq: "add_package" } } }`;
  return `{ _or: [${[deploys, ...calls].join(", ")}] }`;
}

// The rows after a place: the later blocks, and the later rows of its own block.
function afterOf({ height, index }: Place): string {
  const later = `{ block_height: { gt: ${String(height)} } }`;
  if (index === undefined) return later;
  return `{ _or: [${later}, { block_height: { eq: ${String(height)} }, index: { gt: ${String(index)} } }] }`;
}

/** The rows to ask: after a place, up to a tip (so a range is never open-ended). */
export interface Range {
  after: Place;
  tip: number;
}

const pageOf = (realms: Iterable<string>, { after, tip }: Range, tail: string): string =>
  `{ getTransactions(where: { success: { eq: true }, block_height: { lt: ${String(tip + 1)} }, _and: [${realmsOf(realms)}, ${afterOf(after)}] }, order: { heightAndIndex: ASC }, ${tail} }`;

/** A page of these realms' transactions in a range, oldest first. */
export const catchUpQuery = (realms: Iterable<string>, range: Range, limit: number): string =>
  pageOf(realms, range, `limit: ${String(limit)}) { ${TX_FIELDS} }`);

/** The place of the next row of a range, its body not asked (a row too big to read is passed by it). */
export const placeQuery = (realms: Iterable<string>, range: Range): string =>
  pageOf(realms, range, `limit: 1) { ${PLACE_FIELDS} }`);

/** A page of the deploys, newest first, from the block below `before` (none: the newest). */
export const deploysQuery = (before: number | undefined, limit: number): string =>
  `{ getTransactions(where: { success: { eq: true }, ${before === undefined ? "" : `block_height: { lt: ${String(before)} }, `}_or: [{ messages: { typeUrl: { eq: "add_package" } } }] }, order: { heightAndIndex: DESC }, limit: ${String(limit)}) { ${TX_FIELDS} } }`;

/** The height and time of these blocks. */
export const blocksQuery = (heights: readonly number[]): string =>
  `{ getBlocks(where: { _or: [${heights.map((height) => `{ height: { eq: ${String(height)} } }`).join(", ")}] }, limit: ${String(heights.length)}) { height time } }`;
