// The address of an `abci_query`, shared by the app's, the server's and Jarvis's reads (D113). Its bytes come in as bytes.
import { hexOf } from "@gnoworld/core";

/** The path and query of an abci_query: `path` quoted and escaped whole (it may carry `?limit=N`), `data` in hex. */
export function abciQueryOf(path: string, data: Uint8Array): string {
  return `/abci_query?path=${encodeURIComponent(`"${path}"`)}&data=0x${hexOf(data)}`;
}
