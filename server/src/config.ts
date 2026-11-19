// The server's settings, from the environment, checked at start (ADR-0002 §7): a secret only ever
// comes from the file a *_FILE setting names, and an error names the setting, never its value.
import { ChainId, Key } from "@gnoworld/schemas";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { cardSettings, cardsConfigOf, cardsNeedReader, type CardsConfig } from "./cards/settings.ts";
import { adminOf, apartFromPublic, doorOf, doorSettings, type AdminConfig, type DoorConfig } from "./door/settings.ts";
import type { Thresholds } from "./moderation/decide.ts";
import { moderationSettings } from "./moderation/settings.ts";
import {
  absolute,
  databasePath,
  host,
  isOrigin,
  keyFile,
  list,
  parseSettings,
  port,
  readSecret,
  readWord,
  Secret,
  whole,
} from "@gnoworld/service/settings";

export interface Config {
  host: string;
  port: number;
  database: string;
  trustedProxy: string | undefined;
  pepper: string;
  roles: string;
  chains: string[];
  origins: string[];
  newAccountsPerHour: number;
  // The guest chat: its switch, and the new names an hour a visitor and in all, and the guests living at once.
  guests: { on: boolean; perVisitor: number; perHour: number; living: number };
  // The worlds that can be first charted: every world when none is named.
  firstToChart: ReadonlySet<string> | undefined;
  authSocket: string | undefined;
  // Ergo's internal listener and its operator's password; no IRC link without the password's file.
  ergo: { host: string; port: number; password: string } | undefined;
  // Ergo's data folder, mounted read-only, and the bytes it may fill before the alert's 80%.
  ergoData: { dir: string; maxBytes: number } | undefined;
  // The file the prices timer writes: absolute, none by default, so no timer.
  markets: string | undefined;
  // The file the worlds job writes: absolute, none by default, so no job; it needs `universes`.
  worlds: string | undefined;
  // The file the preview job writes: absolute, none by default, so no job; it needs `universes` and OpenAI's key, its check.
  previews: string | undefined;
  // The universes' data file: its default universe's RPC is where the prices timer reads the block height; none, no height.
  universes: string | undefined;
  // The hubs' data file: with the universes' it starts the chain's polls, one a universe; none, no chain.
  hubs: string | undefined;
  moderation: {
    openaiKey: Secret | undefined;
    thresholds: Thresholds;
    newAccountHours: number;
    // An account hidden `strikes` times in `windowMinutes` is muted for `minutes`, `max` at once a world.
    mute: { strikes: number; windowMinutes: number; minutes: number; max: number };
  };
  // Jarvis's door: none without jarvis's address.
  jarvis: DoorConfig | undefined;
  // The admin API's own listener (ADR-0002 §6): none without its port.
  admin: AdminConfig | undefined;
  // The realms' two-sentence explanations: a seed file read at the start, none by default, and the new ones Jarvis may make a day.
  explain: { seed: string | undefined; perDay: number };
  // Link cards: a kill switch, off by default, with the link reader's address; the thresholds a card is held to.
  cards: CardsConfig;
}

// Built at each read, not at import: StrykerJS can only turn on a mutant that runs inside a test.
const settingsSchema = () =>
  z
    .object({
      HOST: host(),
      PORT: port().default(8080),
      DATABASE: databasePath,
      TRUSTED_PROXY: z.optional(z.string().refine((address) => isIP(address) !== 0)),
      LOG_PEPPER_FILE: z.string().min(1),
      // The roles file the server ships (server/roles.json), unless a deployment names another.
      ROLES_FILE: z
        .string()
        .min(1)
        .default(fileURLToPath(new URL("../roles.json", import.meta.url))),
      // The chains a login may name, the demo's by default; never none.
      CHAINS: z
        .string()
        .default("onyx-1,gnoland-1")
        .transform((list) => list.split(","))
        .pipe(z.array(z.string().refine((chain) => ChainId.safeParse(chain).success))),
      // The sites a POST may come from (CSRF); none by default, so every POST is refused until set.
      ORIGINS: list(z.string().refine(isOrigin)),
      NEW_ACCOUNTS_PER_HOUR: z
        .string()
        .regex(/^[1-9]\d{0,3}$/)
        .transform(Number)
        .pipe(z.number().max(1000))
        .default(5),
      // GUEST_CHAT=off puts the site back to read-only guests: both guest routes answer 404, nothing is relayed.
      GUEST_CHAT: z.enum(["on", "off"]).default("on"),
      GUEST_NAMES_PER_VISITOR_HOUR: whole(1000, 10),
      GUEST_NAMES_PER_HOUR: whole(10_000, 600),
      GUEST_LIVING: whole(50_000, 5000),
      // The worlds that can be first charted: unset, every world; else slugs, at least one.
      FIRST_TO_CHART_WORLDS: z
        .string()
        .transform((text) => text.split(","))
        .pipe(z.array(z.string().refine((slug) => Key.safeParse(slug).success)))
        .optional(),
      // The socket Ergo's auth script dials: an absolute path, within what a socket's address holds.
      AUTH_SOCKET: z
        .string()
        .regex(/^\/./)
        .refine((path) => Buffer.byteLength(path) <= 100)
        .optional(),
      ERGO_HOST: host(),
      ERGO_PORT: z
        .string()
        .regex(/^[1-9]\d{0,4}$/)
        .transform(Number)
        .pipe(z.number().max(65_535))
        .default(6667),
      ERGO_OPER_PASSWORD_FILE: z.string().min(1).optional(),
      // Ergo's data folder, measured: absolute, each part a name (no "", "." or ".."), so never the root a
      // walk would take whole, however spelled.
      ERGO_DATA: absolute.optional(),
      ERGO_DATA_MB: whole(1_048_576, 1024),
      // The prices timer's file, written as ERGO_DATA is: no trailing slash, so a file's name.
      MARKETS_FILE: absolute.optional(),
      // The worlds job's file, written like MARKETS_FILE; the job reads the chain UNIVERSES_FILE names as default.
      WORLDS_FILE: absolute.optional(),
      // The preview job's file, written like MARKETS_FILE: the default universe's hubs' pages, each checked before it is written.
      PREVIEWS_FILE: absolute.optional(),
      UNIVERSES_FILE: absolute.optional(),
      EXPLAIN_SEED_FILE: absolute.optional(),
      EXPLAIN_PER_DAY: whole(1000, 30),
      HUBS_FILE: absolute.optional(),
      ...moderationSettings(),
      ...cardSettings(),
      ...doorSettings(),
    })
    .superRefine(apartFromPublic)
    .superRefine(cardsNeedReader);

export function loadConfig(env: Record<string, string | undefined>): Config {
  const settings = parseSettings(settingsSchema(), env);
  const { HOST, PORT, DATABASE, TRUSTED_PROXY, LOG_PEPPER_FILE, ROLES_FILE, CHAINS, ORIGINS, NEW_ACCOUNTS_PER_HOUR } =
    settings;
  const { AUTH_SOCKET, ERGO_HOST, ERGO_PORT, ERGO_OPER_PASSWORD_FILE, ERGO_DATA, ERGO_DATA_MB } = settings;
  const { OPENAI_API_KEY_FILE, MODERATION_THRESHOLDS, NEW_ACCOUNT_HOURS } = settings;
  const { MUTE_STRIKES, MUTE_WINDOW_MINUTES, MUTE_MINUTES, MUTE_MAX } = settings;
  return {
    host: HOST,
    port: PORT,
    database: DATABASE,
    trustedProxy: TRUSTED_PROXY,
    pepper: readSecret("LOG_PEPPER_FILE", LOG_PEPPER_FILE),
    roles: ROLES_FILE,
    chains: CHAINS,
    origins: ORIGINS,
    newAccountsPerHour: NEW_ACCOUNTS_PER_HOUR,
    guests: {
      on: settings.GUEST_CHAT === "on",
      perVisitor: settings.GUEST_NAMES_PER_VISITOR_HOUR,
      perHour: settings.GUEST_NAMES_PER_HOUR,
      living: settings.GUEST_LIVING,
    },
    firstToChart: settings.FIRST_TO_CHART_WORLDS === undefined ? undefined : new Set(settings.FIRST_TO_CHART_WORLDS),
    authSocket: AUTH_SOCKET,
    ergo: ergoOf(env, { host: ERGO_HOST, port: ERGO_PORT, passwordFile: ERGO_OPER_PASSWORD_FILE }),
    ergoData: ergoDataOf(env, ERGO_DATA, ERGO_DATA_MB),
    markets: settings.MARKETS_FILE,
    worlds: settings.WORLDS_FILE,
    previews: settings.PREVIEWS_FILE,
    universes: settings.UNIVERSES_FILE,
    hubs: hubsOf(env, settings.HUBS_FILE),
    moderation: {
      // Opt-in: only MODERATION=on reads OpenAI's key, and then the server stops without it.
      openaiKey: settings.MODERATION === "on" ? keyFile("OPENAI_API_KEY_FILE", OPENAI_API_KEY_FILE, true) : undefined,
      thresholds: MODERATION_THRESHOLDS,
      newAccountHours: NEW_ACCOUNT_HOURS,
      mute: { strikes: MUTE_STRIKES, windowMinutes: MUTE_WINDOW_MINUTES, minutes: MUTE_MINUTES, max: MUTE_MAX },
    },
    explain: { seed: settings.EXPLAIN_SEED_FILE, perDay: settings.EXPLAIN_PER_DAY },
    jarvis: doorOf(env, settings),
    admin: adminOf(env, settings),
    cards: cardsConfigOf(settings, MODERATION_THRESHOLDS),
  };
}

// The hubs' file, or none. Without the universes' file it names no indexer: the server stops rather than run without the
// chain it was asked for.
function hubsOf(env: Record<string, string | undefined>, file: string | undefined): string | undefined {
  if (file !== undefined && env["UNIVERSES_FILE"] === undefined) throw new Error("setting UNIVERSES_FILE: required");
  return file;
}

// The link to Ergo, or none without the password's file. Ergo's listener named with no password is a link
// meant that would not come: the server stops rather than run silent.
function ergoOf(
  env: Record<string, string | undefined>,
  { host, port, passwordFile }: { host: string; port: number; passwordFile: string | undefined },
): Config["ergo"] {
  if (passwordFile !== undefined) return { host, port, password: readWord("ERGO_OPER_PASSWORD_FILE", passwordFile) };
  if (env["ERGO_HOST"] !== undefined || env["ERGO_PORT"] !== undefined) {
    throw new Error("setting ERGO_OPER_PASSWORD_FILE: required");
  }
  return undefined;
}

// Ergo's folder and its cap in bytes, or none. A cap with no folder is a measure meant that would not come: the
// server stops rather than run blind.
function ergoDataOf(env: Record<string, string | undefined>, dir: string | undefined, mb: number): Config["ergoData"] {
  if (dir !== undefined) return { dir, maxBytes: mb * 1024 * 1024 };
  if (env["ERGO_DATA_MB"] !== undefined) throw new Error("setting ERGO_DATA: required");
  return undefined;
}
