// What a deployment serves once the server's jobs ran, which the static host of the journeys lacks: the recorded worlds' file, its count
// as the job counts it (nginx's /worlds-count.json), the people's count and the network's line.
// A page that watches every request meets no 404.
import { worldsDrawn } from "@gnoworld/core";
import { WorldsCount } from "@gnoworld/schemas";
import { NetworkAnswer, Worlds } from "@gnoworld/schemas/indexer";
import type { BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import universes from "../../data/universes.json" with { type: "json" };
import { connectOrigins } from "../../src/cspOrigins.ts";

export const RECORDED_FILE = readFileSync(new URL("../recordedWorlds.json", import.meta.url), "utf8");
const RECORDED = Worlds.parse(JSON.parse(RECORDED_FILE));
export const COUNTED = JSON.stringify(
  WorldsCount.parse({
    version: 1,
    universe: RECORDED.universe,
    updated: RECORDED.updated,
    count: worldsDrawn(RECORDED.worlds),
  }),
);

// The network's line, as the job's last pass writes it: the chain's last two days and its tip.
const NETWORK = JSON.stringify(
  NetworkAnswer.parse({
    version: 1,
    universe: RECORDED.universe,
    updated: RECORDED.updated,
    tip: { height: 1203885, time: RECORDED.updated },
    days: [
      { day: "2026-11-01", txs: 120, accounts: 14 },
      { day: "2026-11-02", txs: 150, accounts: 18 },
    ],
  }),
);

export async function serveJobs(context: BrowserContext, headers: Record<string, string>): Promise<void> {
  const served: [string, string, Record<string, string>][] = [
    ["**/worlds.json", RECORDED_FILE, headers],
    ["**/api/presence/people", JSON.stringify({ online: 3, countries: 2 }), headers],
    ["**/api/network", NETWORK, headers],
    ["**/worlds-count.json", COUNTED, { "content-type": "application/json", "cache-control": "public, max-age=60" }],
  ];
  for (const [pattern, body, answer] of served)
    await context.route(pattern, (route) => route.fulfill({ headers: answer, body }));
}

/** No real chain: every origin connect-src names (the universes' RPC and indexers) refused in the browser. GitHub's runner has a network
 * and the sandbox none, so a node's answer, and its latency, would time a journey there alone; one that reads a chain routes its own on its
 * page, which goes first. */
export const refuseChains = (context: BrowserContext) =>
  Promise.all(
    connectOrigins(universes).map((origin) => context.route(`${origin}/**`, (route) => route.abort("blockedbyclient"))),
  );
