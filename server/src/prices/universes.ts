// The default universe, from the data the app is built from (app/data/universes.json, copied into the server's image): its RPC,
// the host the prices timer reads the block height from and the one the egress proxy lets out besides CoinGecko's and
// OpenAI's, and its chain's id, which that node's status must name (D120). The file goes through the data's own schema, so what
// the build accepted is what the server reads; a bad file stops the server at boot, naming the file and nothing of what it
// held (a file that is not there is the system's error, which names it too).
import { readFileSync } from "node:fs";
import { jsonOf } from "@gnoworld/core";
import { Universes } from "@gnoworld/schemas";

/** The default universe's RPC and chain; throws on a file that is no good list with a default universe. */
export function defaultUniverse(file: string): { rpc: string; chainId: string } {
  // A text that is no JSON reaches the schema as nothing: a parse error would quote it.
  const parsed = Universes.safeParse(jsonOf(readFileSync(file, "utf8")));
  const chosen = parsed.success ? parsed.data.find((universe) => universe.default === true) : undefined;
  if (chosen === undefined) throw new Error(`universes: ${file} does not hold a good list with a default universe`);
  return { rpc: chosen.rpc, chainId: chosen.chainId };
}
