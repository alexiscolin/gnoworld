// The default universe (its id, RPC and indexer), from the data the app is built from (app/data/universes.json, copied into the server's image): the
// host the prices timer reads the block height from and the worlds job reads the realm list from.
// The file goes through the data's own schema, so what the build accepted is what the server reads; a bad file stops the server
// at boot, naming the file and nothing of what it held (a file that is not there is the system's error, which names it too).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { hubWorldOf } from "@gnoworld/core";
import { Hubs, Universes } from "@gnoworld/schemas";

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

/** Each hub of the default universe that lists realms, by its slug, with its first realm's world (core's hubWorldOf), from hubs.json beside
 * the universes' file: the trends read its rooms and its realms as one world (7t3). A hub with no realm is a world of its own, joined to no
 * chain's world: one of its slug would be a realm alone in a namespace of that name, someone else's. */
export function hubWorlds(universesFile: string): Map<string, string> {
  const file = join(dirname(universesFile), "hubs.json");
  const parsed = Hubs.safeParse(dataOf(file));
  if (!parsed.success) throw new Error(`hubs: ${file} does not hold a good list of hubs`);
  const universe = defaultUniverse(universesFile).id;
  return new Map(
    parsed.data.flatMap((hub) =>
      hub.universe === universe && hub.realms !== undefined ? [[hub.slug, hubWorldOf(hub)] as const] : [],
    ),
  );
}
