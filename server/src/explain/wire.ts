// The explanations' wiring at the server's start: the table's seed read, the explainer on Jarvis's door and the route; none without the universes' file.
import { defaultUniverse } from "../prices/universes.ts";
import type { Hono } from "hono";
import { fileURLToPath } from "node:url";
import type { DatabaseSync } from "node:sqlite";
import type { Log } from "@gnoworld/service/log";
import type { Config } from "../config.ts";
import type { Jarvis } from "../door/jarvis.ts";
import { worldsFile } from "../worlds/person.ts";
import { realmsListed } from "./listed.ts";
import { makeExplainer } from "./make.ts";
import { explainRoutes } from "./routes.ts";
import { loadSeed } from "./seed.ts";
import { makeExplanations, type Key } from "./store.ts";

/** The explanations shipped with the server (onyx's realms), read when no seed file is set; the server's image copies this folder. */
export const BUNDLED_SEED = fileURLToPath(new URL("./onyxSeed.json", import.meta.url));

/** Whether a subject is made: a realm of the default universe's chain that the worlds file lists, never another path or chain. */
export const isKnown =
  (chainId: string, listed: () => ReadonlySet<string>) =>
  ({ chain, subject }: Key): boolean =>
    chain === chainId && listed().has(subject);

/** A realm's explanation, asked for by any visitor and made by Jarvis once, at the first visit, for a realm of the default universe's worlds file;
 * what is made shows even while Jarvis is off. */
export function explainBoot({
  app,
  db,
  config,
  jarvis,
  log,
}: {
  app: Hono;
  db: DatabaseSync;
  config: Config;
  /** Jarvis's door when it is switched on, else none. */
  jarvis: Pick<Jarvis, "explain"> | undefined;
  log: Log;
}): void {
  if (config.universes === undefined) return;
  const universe = defaultUniverse(config.universes);
  const store = makeExplanations(db);
  loadSeed({ file: config.explain.seed ?? BUNDLED_SEED, store, now: Date.now, log });
  const listed = realmsListed(worldsFile(config.worlds));
  const explainer = makeExplainer({
    store,
    jarvis,
    known: isKnown(universe.chainId, () => listed()),
    now: Date.now,
    log,
    perDay: config.explain.perDay,
    gapMs: 60_000,
  });
  app.route("/api/explanations", explainRoutes({ explainer, proxy: config.trustedProxy, now: Date.now }));
}
