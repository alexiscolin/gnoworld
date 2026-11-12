// What the worlds job asks of the indexer for token worlds: the transactions whose events come from grc20's package, in the chain's order.
// A negative bound answers nothing, so the first page has none (asks.ts).
import type { IndexerAsk } from "./asks.ts";

const EVENTS = (package_: string): string => `response: { events: { GnoEvent: { pkg_path: { eq: "${package_}" } } } }`;
const FIELDS = "block_height response { events { ... on GnoEvent { type pkg_path attrs { key value } } } }";
const ORDER = "order: { heightAndIndex: ASC }";

/** The first `limit` transactions with an event of `package_` above a height, or from the chain's start without one. */
export const tokenEventsAbove = (package_: string, above: number | undefined, limit: number): IndexerAsk =>
  above === undefined
    ? {
        query: `query($limit: Int!) { getTransactions(where: { ${EVENTS(package_)} }, ${ORDER}, limit: $limit) { ${FIELDS} } }`,
        variables: { limit },
      }
    : {
        query: `query($above: Int!, $limit: Int!) { getTransactions(where: { block_height: { gt: $above }, ${EVENTS(package_)} }, ${ORDER}, limit: $limit) { ${FIELDS} } }`,
        variables: { above, limit },
      };

/** Every such transaction of one block. */
export const tokenEventsInBlock = (package_: string, height: number): IndexerAsk => ({
  query: `query($height: Int!) { getTransactions(where: { block_height: { eq: $height }, ${EVENTS(package_)} }, ${ORDER}) { ${FIELDS} } }`,
  variables: { height },
});

/** The height of the first such transaction above a height, nothing else: what is left to read when that transaction is too large. */
export const tokenHeightAbove = (package_: string, above: number | undefined): IndexerAsk => ({
  query: `query($above: Int!) { getTransactions(where: { block_height: { gt: $above }, ${EVENTS(package_)} }, ${ORDER}, limit: 1) { block_height } }`,
  variables: { above: above ?? -1 },
});
