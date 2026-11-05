// The words of a read of a chain's node or the indexer (D113, D124), which gnoworld/chain-read (gnoworld.config.ts) keeps in
// the chain package. Apart from the rule, so harness_mutate drops each word and runs only the probe's block that plants them.

// A node's RPC routes (tm2/pkg/bft/rpc/core/routes.go, read at c4c72fdd), as a URL's path or a JSON-RPC call's method; its
// two ABCI routes are the first word's, anywhere.
export const ROUTES =
  "status|block|block_results|blockchain|commit|validators|genesis|net_info|health|tx|tx_search|broadcast_tx_(?:async|sync|commit)|unconfirmed_txs|num_unconfirmed_txs|consensus_state|dump_consensus_state|consensus_params";
// A read's words (D113, D124): what a request to a chain's node or the indexer says, which the chain package alone may
// write. A node's bare address is configuration, which reaches nothing alone; a route of our own ("/status") names no address.
export const WORDS: readonly (readonly [string, RegExp])[] = [
  ["an ABCI query", /abci_(?:query|info)/],
  ["an ABCI path", /(?<![A-Za-z])vm(?:\/|%2[Ff])q|\b(?:auth\/accounts|bank\/balances)\//],
  ["a node's RPC route after its address", new RegExp(`(?:\\$\\{\\}|://[^/?#\\s]+)/(?:${ROUTES})(?![\\w-])`)],
  ["a node's RPC method", new RegExp(`"method"\\s*:\\s*"(?:${ROUTES})"`)],
  ["a node's RPC port", /:26657(?!\d)/],
  ["an indexer's GraphQL operation", /^\s*(?:(?:query|subscription|mutation)\b[^{]*\{|\{\s*[A-Za-z_]\w*\s*[({])/],
  ["the chain package's fake node", /^@gnoworld\/chain\/testing(?:\/|$)/],
];
