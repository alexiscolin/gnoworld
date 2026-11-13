// What the server asks the indexer for one transaction by its hash: the call's arguments, cost, result and events, never the signed
// transaction itself (`content_raw`).
import type { IndexerAsk } from "./asks.ts";

/** One transaction by its hash (standard base64, as the indexer writes it). */
export const callAsk = (hash: string): IndexerAsk => ({
  query:
    "query($hash: String!) { getTransactions(where: { hash: { eq: $hash } }, limit: 1) { block_height success gas_wanted gas_used gas_fee { amount denom } memo messages { value { __typename ... on MsgCall { caller pkg_path func args send } } } response { error events { __typename ... on GnoEvent { type attrs { key value } } } } } }",
  variables: { hash },
});
