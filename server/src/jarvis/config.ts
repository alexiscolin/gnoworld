// jarvis's settings (ADR-0002 §5, §7; D44, D45, D47, D65 to D67, D106), from its environment, checked at start as the
// server's are (settings.ts): Anthropic's key only from its file, the day's budgets, the caps on a question and a
// call, the models by task, gnoscope's switch and server, the places' and the skills' folders, gnomcp's command and
// configuration, and the chain profiles it may read. An error names the setting and its fault, never its value.
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { absolute, databasePath, parseSettings, readWord, Secret, whole } from "../settings.ts";
import { MODELS, type Model } from "./prices.ts";

export interface JarvisConfig {
  anthropicKey: Secret;
  database: string;
  // A UTC day's caps in nano-dollars, prices.ts's unit: the questions', and the translations' apart (D47).
  budgets: { ask: number; translate: number };
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
      ANTHROPIC_API_KEY_FILE: z.string().min(1),
      // A file's absolute path, never ":memory:": a restart would open the day again at zero (D45).
      JARVIS_DATABASE: databasePath.pipe(absolute),
      JARVIS_BUDGET_USD: whole(500, 45),
      JARVIS_TRANSLATION_BUDGET_USD: whole(500, 5),
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
        .pipe(z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/))),
      JARVIS_DATA_DIR: absolute.default(fileURLToPath(new URL("../../../app/data", import.meta.url))),
      JARVIS_SKILLS_DIR: absolute.default(fileURLToPath(new URL("../../jarvis/skills", import.meta.url))),
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
  const dollar = 1_000_000_000;
  return {
    anthropicKey: new Secret(readWord("ANTHROPIC_API_KEY_FILE", settings.ANTHROPIC_API_KEY_FILE)),
    database: settings.JARVIS_DATABASE,
    budgets: { ask: settings.JARVIS_BUDGET_USD * dollar, translate: settings.JARVIS_TRANSLATION_BUDGET_USD * dollar },
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
