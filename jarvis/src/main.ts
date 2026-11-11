// jarvis's process (ADR-0002 §5, §7): its switch and settings, its file, the budget, and, switched on alone, its key,
// its spans, its skills and places, gnomcp read-only, its cards, gnoscope behind its own switch, the loop, the translator
// and the digests (10k); then its
// HTTP face where its settings say. On SIGTERM it stops taking questions, lets those in flight end within its wait,
// then closes gnomcp, gnoscope, the spans and its file, and exits by itself (D171, D178). Started as the image starts
// it: node --disallow-code-generation-from-strings jarvis/src/main.ts
import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "@gnoworld/service/db";
import { stop } from "@gnoworld/service/http";
import { logger, type Log } from "@gnoworld/service/log";
import { makeBudget, type Budget } from "./budget.ts";
import { loadJarvisConfig, loadServed } from "./config.ts";
import { makeDigests } from "./digest.ts";
import { startGnomcp } from "./gnomcp.ts";
import { serve } from "./http.ts";
import { makeAskLoops } from "./askLoops.ts";
import { jarvisMigrations } from "./migrations.ts";
import { connectAnthropic } from "./model.ts";
import { DOLLAR } from "./prices.ts";
import { jarvisRoutes } from "./routes.ts";
import { loadSkills } from "./skills.ts";
import { toolbox } from "./toolbox.ts";
import { cardTools } from "./tools/cards.ts";
import { startGnoscope } from "./tools/gnoscope.ts";
import { loadPlaces, placesTool } from "./tools/places.ts";
import { startTracing } from "./tracing.ts";
import { makeTranslator } from "./translate.ts";

const FLAG = "--disallow-code-generation-from-strings";
if (!process.execArgv.includes(FLAG)) throw new Error(`start jarvis with ${FLAG} (ADR-0002 §7)`);
// A hold lives past the longest call, 600 s (D65), by a minute, so it never counts its worst before the call ends (D173).
const HOLD_MS = 11 * 60_000;

const served = loadServed(process.env);
// jarvis logs no account (D42): the pepper of its HMAC is drawn at each start and kept by nobody (D179).
const log = logger(randomBytes(32).toString("hex"), (line) => process.stdout.write(line));
const db = openDatabase(served.database, jarvisMigrations);
const budget = makeBudget(db, { caps: served.budgets, holdMs: HOLD_MS, now: Date.now });
// The file's caps are the first start's or an admin's: one its setting no longer names is said, so an operator who
// lowered the setting knows it is not the cap (F5289).
for (const kind of ["ask", "translate"] as const) {
  const kept = budget.caps()[kind];
  if (kept !== served.budgets[kind]) log("jarvis_budget_kept", { setting: kind, value: kept / DOLLAR });
}
// A start refused closes the file too, so nothing is left behind it (F5289).
const running = served.on
  ? await startModel(log, budget, db).catch((error: unknown) => {
      db.close();
      throw error;
    })
  : undefined;
let draining = false;
const routes = {
  ask: running?.ask,
  catchUp: running?.catchUp,
  explain: running?.explain,
  translate: running?.translate,
  digest: running?.digest,
  budget,
  log,
};
const jarvis = await serve(jarvisRoutes(routes), {
  ...served.listen,
  key: served.doorKey,
  log,
  ready: () => !draining,
});

// Switched on: what answers a question, each part checked at its start, and how it closes. What starts no child comes
// first; past gnomcp's start, a part refused ends gnomcp before the start fails (F5289).
async function startModel(log: Log, budget: Budget, db: DatabaseSync) {
  const config = loadJarvisConfig(process.env);
  // The model's one client refuses an environment that would add headers to its requests.
  const send = connectAnthropic(config.anthropicKey, config.caps.callTimeoutMs);
  const tracing = startTracing(process.env);
  const skills = loadSkills(config.skills);
  const places = loadPlaces(config.places);
  const gnomcp = await startGnomcp({ ...config.gnomcp, profiles: config.profiles, log });
  try {
    const cards = cardTools({ chains: config.profiles.read, places, read: (name, args) => gnomcp.call(name, args) });
    const gnoscope = await startGnoscope({ on: config.gnoscope, ...config.gnoscopeServer, log });
    const profiles = { chains: config.profiles.read, indexed: config.profiles.indexed };
    const tools = toolbox({ profiles, gnomcp, skills, places: placesTool(places), cards, gnoscope, log });
    const { tracer } = tracing;
    // A chain is read on its universe's profile when Jarvis's gnomcp names one; none for a chain with none or no chain at all.
    const byChain = new Map(
      [...places.universes.values()]
        .filter(({ id }) => profiles.chains.includes(id))
        .map(({ chainId, id }) => [chainId, id]),
    );
    const explain = {
      tools: tools.explain,
      profileOf: (chain: string | undefined) => (chain === undefined ? undefined : byChain.get(chain)),
    };
    const loop = makeAskLoops({
      send,
      budget,
      log,
      tracer,
      models: config.models,
      caps: config.caps,
      skills,
      tools,
      explain,
    });
    // Translations and digests on the fast model (ADR-0002 §5, "Models").
    const fast = { send, budget, log, tracer, model: config.models.fast };
    const translator = makeTranslator({ ...fast, db, retries: config.caps.retries, now: Date.now });
    const digests = makeDigests({ db, places, cards, loop: { ...fast, caps: config.caps }, now: Date.now });
    return {
      ask: loop.ask,
      catchUp: loop.catchUp,
      explain: loop.explain,
      translate: translator.translate,
      digest: digests.digest,
      close: async (): Promise<void> => {
        await gnomcp.close();
        await gnoscope.close();
        await tracing.shutdown();
      },
    };
  } catch (error) {
    await gnomcp.close();
    throw error;
  }
}

// Once every connection is gone and every question has ended: gnomcp, gnoscope, the spans, then the file.
async function closeAll(): Promise<void> {
  await jarvis.idle();
  await running?.close();
  db.close();
  // A call out still open would hold the exit past the container's grace period: everything is closed, so leave.
  setTimeout(() => process.exit(0), 200).unref();
}

// A stop that failed leaves loudly: its error's name logged, never its message, and the process ended.
const failed = (error: unknown): void => {
  log("jarvis_stop_failed", { error: error instanceof Error ? error.name : typeof error });
  process.exit(1);
};
// SIGTERM from the container's runtime, SIGINT from a terminal: one drain, however many arrive. Set before jarvis says
// it listens, so a signal sent on that line is drained, not fatal.
const drain = (): void => {
  if (draining) return;
  draining = true;
  log("stopping");
  stop(
    jarvis.server,
    () => {
      closeAll().catch(failed);
    },
    served.drainMs,
  );
};
process.on("SIGTERM", drain);
process.on("SIGINT", drain);
const address = jarvis.server.address();
log("listening", { port: typeof address === "object" && address !== null ? address.port : served.listen.port });
