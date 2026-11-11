// What the server's jobs ask of a chain's node and its indexer (D113): the words of each request, written here and nowhere else.
// A request is data (a path and its data, a query and its variables); the job sends it over its own way out.
import { evalNameOf, evalOwner } from "@gnoworld/core";

/** An abci_query: the route (it may carry `?limit=N`) and its data. */
export interface AbciAsk {
  readonly path: string;
  readonly data: string;
}

/** A GraphQL operation of the indexer and its variables. */
export interface IndexerAsk {
  readonly query: string;
  readonly variables: object;
}

/** A realm's or a package's page, as the chain renders it. */
export const renderAsk = (path: string): AbciAsk => ({ path: "vm/qrender", data: `${path}:` });

/** The realms or packages under a prefix, at most `limit` lines. */
export const pathsAsk = (prefix: string, limit: number): AbciAsk => ({
  path: `vm/qpaths?limit=${String(limit)}`,
  data: prefix,
});

/** A package's documentation. */
export const docAsk = (path: string): AbciAsk => ({ path: "vm/qdoc", data: path });

/** A package's file. */
export const fileAsk = (path: string): AbciAsk => ({ path: "vm/qfile", data: path });

/** The name registered for an address, or null for a text that is no address. It composes core's one builder, never an expression given. */
export function nameAsk(address: string): AbciAsk | null {
  const expression = evalNameOf(address);
  return expression === null ? null : { path: "vm/qeval", data: expression };
}

/** The expression that gives the address holding a namespace, or null for a text that is no name. */
export function ownerAsk(namespace: string): AbciAsk | null {
  const expression = evalOwner(namespace);
  return expression === null ? null : { path: "vm/qeval", data: expression };
}

// A filter on a message's value reaches only the type it names and lets every other message through (onyx-1's auth sessions), so the
// transactions are chosen by a call's type and a message that is no call is left out here. A negative bound answers nothing: the first page
// has none.
const CALLS = 'messages: { typeUrl: { eq: "exec" } }';
const ORDER = "order: { heightAndIndex: ASC }";

// A call's success and function for the rollup (13a) alone: the worlds file's whole-chain read pays for neither (212 B a transaction with
// them, 180 B without, on onyx-1).
const fields = (rich: boolean): string =>
  rich
    ? "block_height success messages { value { __typename ... on MsgCall { pkg_path caller func } } }"
    : "block_height messages { value { __typename ... on MsgCall { pkg_path caller } } }";

/** The first `limit` transactions with a call, from the chain's start; `rich`, each call's success and function too. */
export const callsFirst = (limit: number, rich = false): IndexerAsk => ({
  query: `query($limit: Int!) { getTransactions(where: { ${CALLS} }, ${ORDER}, limit: $limit) { ${fields(rich)} } }`,
  variables: { limit },
});

/** The first `limit` transactions with a call above a height. */
export const callsAbove = (above: number, limit: number, rich = false): IndexerAsk => ({
  query: `query($above: Int!, $limit: Int!) { getTransactions(where: { block_height: { gt: $above }, ${CALLS} }, ${ORDER}, limit: $limit) { ${fields(rich)} } }`,
  variables: { above, limit },
});

/** Every transaction with a call in one block. */
export const callsInBlock = (height: number, rich = false): IndexerAsk => ({
  query: `query($height: Int!) { getTransactions(where: { block_height: { eq: $height }, ${CALLS} }, ${ORDER}) { ${fields(rich)} } }`,
  variables: { height },
});

/** The time of each block of `heights`, one alias each, `b<i>` for the variable `h<i>` (the rollup's days, slice 13a). */
export const blockTimes = (heights: readonly number[]): IndexerAsk => ({
  query: `query(${heights.map((_, i) => `$h${String(i)}: Int!`).join(", ")}) { ${heights
    .map((_, i) => `b${String(i)}: getBlocks(where: { height: { eq: $h${String(i)} } }) { height time }`)
    .join(" ")} }`,
  variables: Object.fromEntries(heights.map((height, i) => [`h${String(i)}`, height])),
});
