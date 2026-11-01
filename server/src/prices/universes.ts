// The default universe (its id, RPC and indexer), from the data the app is built from (app/data/universes.json, copied into the server's image): the
// host the prices timer reads the block height from and the worlds job reads the realm list from.
// The file goes through the data's own schema, so what the build accepted is what the server reads; a bad file stops the server
// at boot, naming the file and nothing of what it held (a file that is not there is the system's error, which names it too).
import { readFileSync } from "node:fs";
import { Universes } from "@gnoworld/schemas";

/** The id, RPC and indexer of the universe marked default. */
export function defaultUniverse(file: string): { id: string; rpc: string; indexer: string } {
  let rows: unknown;
  try {
    rows = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    // A parse error quotes the text, so it stays out of the message; a file that is not there says its path in its own.
    if (error instanceof SyntaxError) rows = undefined;
    else throw error;
  }
  const parsed = Universes.safeParse(rows);
  const chosen = parsed.success ? parsed.data.find((universe) => universe.default === true) : undefined;
  if (chosen === undefined) throw new Error(`universes: ${file} does not hold a good list with a default universe`);
  return { id: chosen.id, rpc: chosen.rpc, indexer: chosen.indexer };
}

export const defaultRpc = (file: string): string => defaultUniverse(file).rpc;
