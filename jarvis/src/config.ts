// jarvis's settings (ADR-0002 §5, §7; D44, D45, D47, D65 to D67, D106, D171, D172), from its environment, checked at
// start as the server's are (settings.ts): what it reads on or off (its switch, where it listens, its file, the day's
// budgets, its stop's wait), then, on alone, Anthropic's key only from its file, the caps on a question and a call,
// the models, gnoscope's switch and server, the places' and skills' folders, gnomcp and the chain profiles it may read.
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { absolute, databasePath, host, parseSettings, port, readWord, Secret, whole } from "@gnoworld/service/settings";
import { DOLLAR, MODELS, type Model } from "./prices.ts";
import { isNetwork } from "./tools/gnoscopeTools.ts";

export interface JarvisConfig {
  anthropicKey: Secret;
  caps: {
    questionChars: number;
    turns: number;
    outputTokens: number;
    callTimeoutMs: number;
    retries: number;
    toolResultBytes: number;
  };
  // The model that answers, the one that sorts, summarises and translates, and the one for hard realm code.
  models: { main: Model; fast: Model; deep: Model };
  gnoscope: boolean;
  // Where gnoscope answers, a call's time, and the networks its tools may name, in gnoscope's own words.
  gnoscopeServer: { url: string; timeoutMs: number; networks: string[] };
  // The folder of the places' data files (app/data's).
  places: string;
  skills: string;
  gnomcp: { command: string; config: string };
  // The chain profiles gnomcp may read for jarvis, and those of them with an indexer.
  profiles: { read: string[]; indexed: string[] };
}

/** What jarvis reads on or off: off, it reads nothing more (D171). */
export interface Served {
  on: boolean;
  // Where it listens, and the names a request's Host may give it, so a page another site's DNS steers to jarvis is
  // refused (F5288).
  listen: { host: string; port: number; names: string[] };
  database: string;
  // A UTC day's caps in nano-dollars, prices.ts's unit: the questions', and the translations' apart (D47).
  budgets: { ask: number; translate: number };
  // How long a stop waits for the questions in flight before it cuts them (D178).
  drainMs: number;
}

// The settings read on or off; their schemas built at each read (F412).
const servedShape = () => ({
  // Exactly `on`, anything else or nothing off, never an error (Alexis, "Coupé par défaut").
  JARVIS: z.string().optional(),
  JARVIS_HOST: host(),
  JARVIS_PORT: port().default(8081),
  JARVIS_HOSTNAMES: z
    .string()
    .default("127.0.0.1,localhost")
    .transform((list) => list.split(","))
    .pipe(z.array(z.string().regex(/^(?:[a-z0-9][a-z0-9.-]{0,252}|\[[0-9a-f:.]{2,45}\])$/))),
  // A file's absolute path, never ":memory:": a restart would open the day again at zero (D45).
  JARVIS_DATABASE: databasePath.pipe(absolute),
  JARVIS_BUDGET_USD: whole(500, 45),
  JARVIS_TRANSLATION_BUDGET_USD: whole(500, 5),
  JARVIS_DRAIN_S: whole(600, 20),
});
const budgetsOf = (settings: { JARVIS_BUDGET_USD: number; JARVIS_TRANSLATION_BUDGET_USD: number }) => ({
  ask: settings.JARVIS_BUDGET_USD * DOLLAR,
  translate: settings.JARVIS_TRANSLATION_BUDGET_USD * DOLLAR,
});

/** jarvis's switch and what it reads whatever it says; throws naming the first wrong setting, never its value. */
export function loadServed(env: Record<string, string | undefined>): Served {
  const settings = parseSettings(z.object(servedShape()), env);
  return {
    on: settings.JARVIS === "on",
    listen: { host: settings.JARVIS_HOST, port: settings.JARVIS_PORT, names: settings.JARVIS_HOSTNAMES },
    database: settings.JARVIS_DATABASE,
    budgets: budgetsOf(settings),
    drainMs: settings.JARVIS_DRAIN_S * 1000,
  };
}

// An https address with no credentials and no fragment, as a request is sent to it.
function isHttps(text: string): boolean {
  const url = URL.parse(text);
  return url?.protocol === "https:" && url.username === "" && url.password === "" && !text.includes("#");
}

export function loadJarvisConfig(env: Record<string, string | undefined>): JarvisConfig {
  // gnomcp's own pattern for a profile's name (gno_profile_add, gnomcp 0.11.0), 50 characters at most.
  const profiles = z.array(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,49}$/));
  const Env = z
    .object({
      ...servedShape(),
      ANTHROPIC_API_KEY_FILE: z.string().min(1),
      JARVIS_QUESTION_CHARS: whole(8_000, 2_000),
      JARVIS_TURNS: whole(20, 8),
      JARVIS_OUTPUT_TOKENS: whole(16_000, 4_096),
      JARVIS_CALL_TIMEOUT_S: whole(600, 60),
      // Two at most, never more (ADR-0002 §5), or none.
      JARVIS_RETRIES: z.enum(["0", "1", "2"]).default("2").transform(Number),
      JARVIS_TOOL_RESULT_KIB: whole(64, 16),
      JARVIS_MODEL: z.enum(MODELS).default("claude-sonnet-5-5"),
      JARVIS_MODEL_FAST: z.enum(MODELS).default("claude-haiku-5-5"),
      JARVIS_MODEL_DEEP: z.enum(MODELS).default("claude-opus-5-5"),
      JARVIS_GNOSCOPE: z.enum(["on", "off"]).optional(),
      JARVIS_GNOSCOPE_URL: z.string().max(2048).refine(isHttps).default("https://gnoscope.com/mcp"),
      JARVIS_GNOSCOPE_TIMEOUT_S: whole(60, 10),
      // The networks gnoscope's freshness block named on 2026-11-04 (D104).
      JARVIS_GNOSCOPE_NETWORKS: z
        .string()
        .default("mainnet,onyx")
        .transform((list) => list.split(","))
        .pipe(z.array(z.string().refine(isNetwork))),
      JARVIS_DATA_DIR: absolute.default(fileURLToPath(new URL("../../app/data", import.meta.url))),
      JARVIS_SKILLS_DIR: absolute.default(fileURLToPath(new URL("../skills", import.meta.url))),
      JARVIS_GNOMCP_COMMAND: absolute,
      JARVIS_GNOMCP_CONFIG: absolute,
      JARVIS_PROFILES: z
        .string()
        .transform((list) => list.split(","))
        .pipe(profiles),
      JARVIS_INDEXER_PROFILES: z
        .string()
        .default("")
        .transform((list) => (list === "" ? [] : list.split(",")))
        .pipe(profiles),
    })
    .superRefine(({ JARVIS_PROFILES, JARVIS_INDEXER_PROFILES }, ctx) => {
      const readable = new Set(JARVIS_PROFILES);
      for (const [at, name] of JARVIS_INDEXER_PROFILES.entries()) {
        if (!readable.has(name)) ctx.addIssue({ code: "custom", path: ["JARVIS_INDEXER_PROFILES", at] });
      }
    });
  const settings = parseSettings(Env, env);
  return {
    anthropicKey: new Secret(readWord("ANTHROPIC_API_KEY_FILE", settings.ANTHROPIC_API_KEY_FILE)),
    caps: {
      questionChars: settings.JARVIS_QUESTION_CHARS,
      turns: settings.JARVIS_TURNS,
      outputTokens: settings.JARVIS_OUTPUT_TOKENS,
      callTimeoutMs: settings.JARVIS_CALL_TIMEOUT_S * 1000,
      retries: settings.JARVIS_RETRIES,
      toolResultBytes: settings.JARVIS_TOOL_RESULT_KIB * 1024,
    },
    models: { main: settings.JARVIS_MODEL, fast: settings.JARVIS_MODEL_FAST, deep: settings.JARVIS_MODEL_DEEP },
    gnoscope: settings.JARVIS_GNOSCOPE === "on",
    gnoscopeServer: {
      url: settings.JARVIS_GNOSCOPE_URL,
      timeoutMs: settings.JARVIS_GNOSCOPE_TIMEOUT_S * 1000,
      networks: settings.JARVIS_GNOSCOPE_NETWORKS,
    },
    places: settings.JARVIS_DATA_DIR,
    skills: settings.JARVIS_SKILLS_DIR,
    gnomcp: { command: settings.JARVIS_GNOMCP_COMMAND, config: settings.JARVIS_GNOMCP_CONFIG },
    profiles: { read: settings.JARVIS_PROFILES, indexed: settings.JARVIS_INDEXER_PROFILES },
  };
}
