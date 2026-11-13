// The timed jobs made once as the server starts: the prices, the worlds and the previews, and the hubs beside the universes.
import type { openDatabase } from "@gnoworld/service/db";
import type { logger } from "@gnoworld/service/log";
import type { Config } from "../config.ts";
import { checkFor, startPreviews } from "../previews/job.ts";
import { startPrices } from "../prices/prices.ts";
import { defaultUniverse, hubRealms, hubWorlds } from "../prices/universes.ts";
import { startWorlds } from "../worlds/job.ts";
import { worldsListing } from "../worlds/known.ts";
import { tokenStore } from "../worlds/tokenStore.ts";
import type { NetworkAnswer, Trending } from "@gnoworld/schemas/indexer";
import { send } from "@gnoworld/service/net";
import { balanceReader } from "../worlds/balance.ts";
import { dirname, join } from "node:path";

interface Boot {
  config: Pick<Config, "markets" | "universes" | "worlds" | "previews" | "moderation">;
  db: ReturnType<typeof openDatabase>;
  log: ReturnType<typeof logger>;
}

type Config_ = Boot["config"];
type Universes = NonNullable<Config_["universes"]>;
const withUniverse = <T>(universes: Config_["universes"], make: (universe: Universes) => T): T | undefined =>
  universes === undefined ? undefined : make(universes);

// CoinGecko's prices every five minutes into the file MARKETS_FILE names (5l); without it, no timer. With UNIVERSES_FILE the
// same read takes the default universe's block height from its RPC, so a visitor's browser asks no chain.
const bootPrices = ({ markets, universes }: Config_, log: Boot["log"]) =>
  markets === undefined
    ? undefined
    : startPrices({ file: markets, log, ...(universes === undefined ? {} : { universe: defaultUniverse(universes) }) });

// The worlds job (7c, every half hour, WORLDS_FILE) and the previews job (8f, every six hours, PREVIEWS_FILE, each page read by the
// moderation check) read the default universe alone: with no chain, or for previews no check, the server stops rather than run.
function refuseWithout({ worlds, previews, universes, moderation }: Config_): void {
  if ((worlds !== undefined || previews !== undefined) && universes === undefined)
    throw new Error("setting UNIVERSES_FILE: required");
  if (previews !== undefined && moderation.openaiKey === undefined)
    throw new Error("setting OPENAI_API_KEY_FILE: required");
}

/** Each job is none without its data file; the worlds and previews jobs read the default universe alone, so without it the server stops. */
export function bootJobs({ config, db, log }: Boot) {
  const { universes, moderation } = config;
  refuseWithout(config);
  const prices = bootPrices(config, log);
  // The hubs beside the universes, read before the job, so a bad file stops the server at boot.
  const { worlds: file, previews: pagesFile } = config;
  const hubs = file === undefined ? undefined : withUniverse(universes, hubWorlds);
  // The last ranking and the last line of health, kept in memory for GET /api/trending and /api/network: none before a pass has made one.
  let trending: Trending | undefined;
  let network: NetworkAnswer | undefined;
  // One token store for the job's passes and the /api/tokens route: a reset by a pass clears what the route has kept.
  const tokens = withUniverse(universes, (all) => tokenStore(db, defaultUniverse(all).id));
  // The worlds file, read again when its time changes, once for the people, the explanations and the rooms.
  const listing = file === undefined ? undefined : worldsListing(file);
  const worldsRead = listing?.worlds ?? ((): undefined => undefined);
  const worlds =
    file === undefined
      ? undefined
      : withUniverse(universes, (all) =>
          startWorlds({
            file,
            log,
            universe: defaultUniverse(all),
            // Each realm's rollup (13a): its state in the database, its files in a folder beside the worlds' file, which nginx serves.
            rollup: { db, dir: join(dirname(file), "rollups") },
            ...(tokens === undefined ? {} : { tokens }),
            trending: (made) => {
              trending = made;
            },
            network: {
              db,
              told: (made) => {
                network = made;
              },
            },
          }),
        );
  const { openaiKey, thresholds } = moderation;
  const previews =
    pagesFile === undefined || openaiKey === undefined
      ? undefined
      : withUniverse(universes, (all) =>
          startPreviews({
            file: pagesFile,
            log,
            universe: defaultUniverse(all),
            pages: hubRealms(all),
            check: checkFor({ openaiKey, thresholds }, { log }),
          }),
        );
  // A person's balance, read from the default universe's node.
  const balance = withUniverse(universes, (all) =>
    balanceReader({ send, rpc: defaultUniverse(all).rpc, now: Date.now }),
  );
  return {
    prices,
    worlds,
    previews,
    hubs,
    tokens,
    listing,
    worldsRead,
    trending: () => trending,
    network: () => network,
    balance,
  };
}
