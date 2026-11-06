// The first signals (9h) and the chain in the rooms (9g), made once as the server starts: both tell on the one stream.
import type { Hono } from "hono";
import type { openDatabase } from "@gnoworld/service/db";
import type { logger } from "@gnoworld/service/log";
import type { Config } from "../config.ts";
import type { Roles } from "../roles/roles.ts";
import { makeStream } from "../stream/stream.ts";
import { readChainData, startChain } from "./chain/start.ts";
import { signalRoutes } from "./routes.ts";
import { firstSignals, makeSignals } from "./signals.ts";

interface Boot {
  app: Hono;
  db: ReturnType<typeof openDatabase>;
  roles: Roles;
  config: Pick<Config, "universes" | "hubs" | "origins" | "firstToChart">;
  log: ReturnType<typeof logger>;
  session: Parameters<typeof signalRoutes>[0]["session"];
}

/** The stream, the signals' store with its first words told and its routes mounted, and the chain's poll (none without both data files). */
export function bootSignals({ app, db, roles, config, log, session }: Boot) {
  const stream = makeStream();
  const signals = makeSignals(db, { now: Date.now });
  for (const signal of firstSignals(signals, roles.worlds.keys())) stream.signal(signal);
  const chain =
    config.universes === undefined || config.hubs === undefined
      ? undefined
      : startChain({ ...readChainData(config.universes, config.hubs), stream, log, now: Date.now });
  app.route(
    "/api/signals",
    signalRoutes({
      signals,
      roles,
      session,
      origins: config.origins,
      log,
      now: Date.now,
      publish: stream.signal,
      chartable: config.firstToChart,
    }),
  );
  return { stream, signals, chain };
}
