// jarvis's process (ADR-0002 §5, §7): its switch and settings, its file, the budget, and, switched on alone, its key,
// its spans, its skills and places, gnomcp read-only, its cards, gnoscope behind its own switch and the loop; then its
// HTTP face where its settings say. On SIGTERM it stops taking questions, lets those in flight end within its wait,
// then closes gnomcp, gnoscope, the spans and its file, and exits by itself (D171, D178). Started as the image starts
// it: node --disallow-code-generation-from-strings jarvis/src/main.ts
import { randomBytes } from "node:crypto";
import { openDatabase } from "@gnoworld/service/db";
import { stop } from "@gnoworld/service/http";
import { logger, type Log } from "@gnoworld/service/log";
import { makeBudget, type Budget } from "./budget.ts";
import { loadJarvisConfig, loadServed } from "./config.ts";
import { startGnomcp } from "./gnomcp.ts";
import { serve } from "./http.ts";
import { makeLoop } from "./loop.ts";
import { jarvisMigrations } from "./migrations.ts";
import { connectAnthropic } from "./model.ts";
import { jarvisRoutes } from "./routes.ts";
import { loadSkills } from "./skills.ts";
import { toolbox } from "./toolbox.ts";
import { cardTools } from "./tools/cards.ts";
import { startGnoscope } from "./tools/gnoscope.ts";
import { loadPlaces, placesTool } from "./tools/places.ts";
import { startTracing } from "./tracing.ts";

const FLAG = "--disallow-code-generation-from-strings";
if (!process.execArgv.includes(FLAG)) throw new Error(`start jarvis with ${FLAG} (ADR-0002 §7)`);
// A hold lives past the longest call, 600 s (D65), by a minute, so it never counts its worst before the call ends (D173).
const HOLD_MS = 11 * 60_000;

const served = loadServed(process.env);
// jarvis logs no account (D42): the pepper of its HMAC is drawn at each start and kept by nobody (D179).
const log = logger(randomBytes(32).toString("hex"), (line) => process.stdout.write(line));
const db = openDatabase(served.database, jarvisMigrations);
const budget = makeBudget(db, { caps: served.budgets, holdMs: HOLD_MS, now: Date.now });
const running = served.on ? await startModel(log, budget) : undefined;
let draining = false;
const jarvis = await serve(jarvisRoutes({ ask: running?.ask, budget, log }), {
  ...served.listen,
  log,
  ready: () => !draining,
});

// Switched on: what answers a question, each part checked at its start, and how it closes.
async function startModel(log: Log, budget: Budget) {
  const config = loadJarvisConfig(process.env);
  const tracing = startTracing(process.env);
  const skills = loadSkills(config.skills);
  const places = loadPlaces(config.places);
  const gnomcp = await startGnomcp({ ...config.gnomcp, profiles: config.profiles, log });
  let cards: ReturnType<typeof cardTools>;
  try {
    cards = cardTools({ chains: config.profiles.read, places, read: (name, args) => gnomcp.call(name, args) });
  } catch (error) {
    // A start refused ends the child it made.
    await gnomcp.close();
    throw error;
  }
  const gnoscope = await startGnoscope({ on: config.gnoscope, ...config.gnoscopeServer, log });
  const profiles = { chains: config.profiles.read, indexed: config.profiles.indexed };
  const tools = toolbox({ profiles, gnomcp, skills, places: placesTool(places), cards, gnoscope, log });
  const loop = makeLoop({
    send: connectAnthropic(config.anthropicKey, config.caps.callTimeoutMs),
    budget,
    log,
    tracer: tracing.tracer,
    model: config.models.main,
    caps: config.caps,
    skills,
    tools,
  });
  return {
    ask: loop.ask,
    close: async (): Promise<void> => {
      await gnomcp.close();
      await gnoscope.close();
      await tracing.shutdown();
    },
  };
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
