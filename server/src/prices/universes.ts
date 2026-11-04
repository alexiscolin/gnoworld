// The default universe (its id, RPC and indexer), from the data the app is built from (app/data/universes.json, copied into the server's image): the
// host the prices timer reads the block height from and the worlds job reads the realm list from.
// The file goes through the data's own schema, so what the build accepted is what the server reads; a bad file stops the server
// at boot, naming the file and nothing of what it held (a file that is not there is the system's error, which names it too).
import { readFileSync } from "node:fs";
import { Universes } from "@gnoworld/schemas";

// A data file's rows as JSON, or undefined for a file that is no JSON: a parse error quotes the text, so it stays out of any message, and a
// file that is not there says its path in its own.
function dataOf(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

/** The id, RPC and indexer of the universe marked default. */
export function defaultUniverse(file: string): { id: string; rpc: string; indexer: string } {
  const parsed = Universes.safeParse(dataOf(file));
  const chosen = parsed.success ? parsed.data.find((universe) => universe.default === true) : undefined;
  if (chosen === undefined) throw new Error(`universes: ${file} does not hold a good list with a default universe`);
  return { id: chosen.id, rpc: chosen.rpc, indexer: chosen.indexer };
}

export const defaultRpc = (file: string): string => defaultUniverse(file).rpc;
