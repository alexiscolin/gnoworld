// The default universe, from the data the app is built from (app/data/universes.json, copied into the server's image): its id,
// its RPC (the host the prices timer reads the block height from and the egress proxy lets out besides CoinGecko's and
// OpenAI's) and its chain's id, which that node's status must name (D120), its indexer (the worlds job reads the realm list
// from it), and its hubs' pages (the preview job). A file goes through the data's own schema, so what the build accepted is
// what the server reads; a bad file stops the server at boot, naming the file and nothing of what it held, a file it cannot
// read (missing, or past 1 MiB as every data file) with its reason as the cause.
import { dirname, join } from "node:path";
import { hubWorldOf, jsonOf } from "@gnoworld/core";
import { Hubs, Universes } from "@gnoworld/schemas";
import { readDataFile } from "@gnoworld/service/files";

// A data file's rows as JSON, or undefined for a text that is no JSON (a parse error would quote the text, so it stays out of
// any message); a file it cannot read is an error naming the file, its reason the cause.
function dataOf(file: string, what: string): unknown {
  let text: string;
  try {
    text = readDataFile(file);
  } catch (cause) {
    throw new Error(`${what}: ${file} cannot be read`, { cause });
  }
  return jsonOf(text);
}

/** The id, RPC, chain and indexer of the universe marked default. */
export function defaultUniverse(file: string): { id: string; rpc: string; chainId: string; indexer: string } {
  const parsed = Universes.safeParse(dataOf(file, "universes"));
  const chosen = parsed.success ? parsed.data.find((universe) => universe.default === true) : undefined;
  if (chosen === undefined) throw new Error(`universes: ${file} does not hold a good list with a default universe`);
  return { id: chosen.id, rpc: chosen.rpc, chainId: chosen.chainId, indexer: chosen.indexer };
}

/** The hubs of the default universe, from hubs.json beside the universes' file, through the data's schema: a bad file names itself alone. */
export function defaultHubs(universesFile: string) {
  const file = join(dirname(universesFile), "hubs.json");
  const parsed = Hubs.safeParse(dataOf(file, "hubs"));
  if (!parsed.success) throw new Error(`hubs: ${file} does not hold a good list of hubs`);
  const universe = defaultUniverse(universesFile).id;
  return parsed.data.filter((hub) => hub.universe === universe);
}

/** Each hub of the default universe that lists realms, by its slug, with its first realm's world (core's hubWorldOf), from hubs.json beside
 * the universes' file: the trends read its rooms and its realms as one world (7t3). A hub with no realm is a world of its own, joined to no
 * chain's world: one of its slug would be a realm alone in a namespace of that name, someone else's. */
export function hubWorlds(universesFile: string): Map<string, string> {
  return new Map(
    defaultHubs(universesFile).flatMap((hub) =>
      hub.realms === undefined ? [] : [[hub.slug, hubWorldOf(hub)] as const],
    ),
  );
}

/** Every realm the default universe's hubs list, each once, by its path: the pages the preview job captures (8f), the team's own list. */
export function hubRealms(universesFile: string): string[] {
  return [...new Set(defaultHubs(universesFile).flatMap((hub) => hub.realms ?? []))].toSorted();
}
