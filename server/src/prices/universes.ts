// The default universe, from the data the app is built from (app/data/universes.json, copied into the server's image): its RPC,
// the host the prices timer reads the block height from and the one the egress proxy lets out besides CoinGecko's and
// OpenAI's, and its chain's id, which that node's status must name (D120). The file goes through the data's own schema, so what
// the build accepted is what the server reads; a bad file stops the server at boot, naming the file and nothing of what it
// held, a file it cannot read (missing, or past 1 MiB as every data file) with its reason as the cause.
import { jsonOf } from "@gnoworld/core";
import { Universes } from "@gnoworld/schemas";
import { readDataFile } from "@gnoworld/service/files";

/** The default universe's RPC and chain; throws on a file that is no good list with a default universe. */
export function defaultUniverse(file: string): { rpc: string; chainId: string } {
  let text: string;
  try {
    text = readDataFile(file);
  } catch (cause) {
    throw new Error(`universes: ${file} cannot be read`, { cause });
  }
  // A text that is no JSON reaches the schema as nothing: a parse error would quote it.
  const parsed = Universes.safeParse(jsonOf(text));
  const chosen = parsed.success ? parsed.data.find((universe) => universe.default === true) : undefined;
  if (chosen === undefined) throw new Error(`universes: ${file} does not hold a good list with a default universe`);
  return { rpc: chosen.rpc, chainId: chosen.chainId };
}
