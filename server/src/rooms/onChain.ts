// Whether a realm path is on the chain (D413): one `vm/qpaths` read of the path as a prefix, limit 1, the exact path asked for
// (a node sorts a prefix's own path first). A chain that does not answer is "down", never "no".
import { pathsAsk } from "@gnoworld/chain/asks";
import { RealmPath } from "@gnoworld/schemas/indexer";
import type { Send } from "@gnoworld/service/net";
import { abciQuery, Absent } from "../worlds/remote.ts";

export type OnChain = "yes" | "no" | "down";

const READ_MS = 5_000;
const READ_MAX_BYTES = 1_024;

export function chainHas(chain: { send: Send; rpc: string; ms?: number }): (path: string) => Promise<OnChain> {
  const { send, rpc, ms = READ_MS } = chain;
  return async (path) => {
    if (!RealmPath.safeParse(path).success) return "no";
    try {
      const text = await abciQuery({ send, rpc }, pathsAsk(path, 1), { ms, maxBytes: READ_MAX_BYTES });
      return text.split("\n").includes(path) ? "yes" : "no";
    } catch (error) {
      // A refusal that says no such package is no; any other fault is the chain's, not the path's.
      return error instanceof Absent ? "no" : "down";
    }
  };
}
