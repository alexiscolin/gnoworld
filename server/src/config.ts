// The server's settings, from the environment, checked at start (ADR-0002 §7): a secret only ever
// comes from the file a *_FILE setting names, and an error names the setting, never its value.
import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { Thresholds } from "./moderation/decide.ts";
import { CATEGORIES } from "./moderation/provider.ts";

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
  authSocket: string | undefined;
  // Ergo's internal listener and its operator's password; no IRC link without the password's file.
  ergo: { host: string; port: number; password: string } | undefined;
  // Ergo's data folder, mounted read-only, and the bytes it may fill before the alert's 80% (3n-b).
  ergoData: { dir: string; maxBytes: number } | undefined;
  moderation: {
    openaiKey: Secret | undefined;
    thresholds: Thresholds;
    newAccountHours: number;
    // An account hidden `strikes` times in `windowMinutes` is muted for `minutes`, `max` at once a world.
    mute: { strikes: number; windowMinutes: number; minutes: number; max: number };
  };
}

// A secret that never prints: inspect, JSON and a template string show [redacted]; reveal() reads it.
class Secret {
  readonly #value: string;
  constructor(value: string) {
    this.#value = value;
  }
  reveal(): string {
    return this.#value;
  }
  toJSON(): string {
    return "[redacted]";
  }
  toString(): string {
    return "[redacted]";
  }
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return "[redacted]";
  }
}

// An origin as a browser sends it: scheme, host and port, nothing else (an Origin header compares to it).
function isOrigin(text: string): boolean {
  const url = URL.parse(text);
  return url !== null && ["http:", "https:"].includes(url.protocol) && url.origin === text;
}

// A whole number from 1 to `max`, written plainly: no sign, no leading zero, no point.
const whole = (max: number, otherwise: number) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().max(max))
    .default(otherwise);

const Env = z.object({
  HOST: z.string().min(1).max(253).default("127.0.0.1"),
  PORT: z
    .string()
    .regex(/^(0|[1-9]\d{0,4})$/)
    .transform(Number)
    .pipe(z.number().max(65_535))
    .default(8080),
  DATABASE: z.string().min(1).max(1024),
  TRUSTED_PROXY: z
    .string()
    .refine((address) => isIP(address) !== 0)
    .optional(),
  LOG_PEPPER_FILE: z.string().min(1),
  // The roles file the server ships (server/roles.json), unless a deployment names another.
  ROLES_FILE: z
    .string()
    .min(1)
    .default(fileURLToPath(new URL("../roles.json", import.meta.url))),
  // The chains a login may name (decision 142), the demo's by default; never none.
  CHAINS: z
    .string()
    .default("onyx-1,gnoland-1")
    .transform((list) => list.split(","))
    .pipe(z.array(z.string().regex(/^[a-z0-9][a-z0-9.-]{0,49}$/))),
  // The sites a POST may come from (CSRF); none by default, so every POST is refused until set.
  ORIGINS: z
    .string()
    .default("")
    .transform((list) => (list === "" ? [] : list.split(",")))
    .pipe(z.array(z.string().refine(isOrigin))),
  NEW_ACCOUNTS_PER_HOUR: z
    .string()
    .regex(/^[1-9]\d{0,3}$/)
    .transform(Number)
    .pipe(z.number().max(1000))
    .default(5),
  // The socket Ergo's auth script dials (3d): an absolute path, within what a socket's address holds.
  AUTH_SOCKET: z
    .string()
    .regex(/^\/./)
    .refine((path) => Buffer.byteLength(path) <= 100)
    .optional(),
  ERGO_HOST: z.string().min(1).max(253).default("127.0.0.1"),
  ERGO_PORT: z
    .string()
    .regex(/^[1-9]\d{0,4}$/)
    .transform(Number)
    .pipe(z.number().max(65_535))
    .default(6667),
  ERGO_OPER_PASSWORD_FILE: z.string().min(1).optional(),
  // Ergo's data folder, measured (3n-b): absolute, no "..", never the root a walk would take whole.
  ERGO_DATA: z
    .string()
    .regex(/^\/./)
    .refine((path) => !path.split("/").includes(".."))
    .optional(),
  ERGO_DATA_MB: whole(1_048_576, 1024),
  OPENAI_API_KEY_FILE: z.string().min(1).optional(),
  // A score that hides a category in place of OpenAI's own flag, by category: {"harassment": 0.9}.
  MODERATION_THRESHOLDS: z
    .string()
    .transform((text, ctx) => {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "json" });
        return z.NEVER;
      }
    })
    .pipe(
      z.strictObject(Object.fromEntries(CATEGORIES.map((category) => [category, z.number().min(0).max(1).optional()]))),
    )
    .default({}),
  NEW_ACCOUNT_HOURS: whole(720, 24),
  MUTE_STRIKES: whole(99, 3),
  MUTE_WINDOW_MINUTES: whole(1440, 10),
  MUTE_MINUTES: whole(10_080, 5),
  // Ergo's ban list holds 100 a room (3b's table): the mutes leave the moderators their share of it.
  MUTE_MAX: whole(100, 50),
});

export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    // The path and the code only: a message may quote the value.
    const issue = parsed.error.issues[0];
    // A list's entry by its place, so a deploy knows which one; its value stays out.
    const [setting, ...place] = issue?.path ?? [];
    const at = place.length > 0 ? ` (at ${place.map(String).join(".")})` : "";
    throw new Error(`setting ${String(setting)}: ${issue?.code ?? "invalid"}${at}`);
  }
  const { HOST, PORT, DATABASE, TRUSTED_PROXY, LOG_PEPPER_FILE, ROLES_FILE, CHAINS, ORIGINS, NEW_ACCOUNTS_PER_HOUR } =
    parsed.data;
  const { AUTH_SOCKET, ERGO_HOST, ERGO_PORT, ERGO_OPER_PASSWORD_FILE, ERGO_DATA, ERGO_DATA_MB } = parsed.data;
  const { OPENAI_API_KEY_FILE, MODERATION_THRESHOLDS, NEW_ACCOUNT_HOURS } = parsed.data;
  const { MUTE_STRIKES, MUTE_WINDOW_MINUTES, MUTE_MINUTES, MUTE_MAX } = parsed.data;
  return {
    host: HOST,
    port: PORT,
    database: DATABASE,
    trustedProxy: TRUSTED_PROXY,
    pepper: secret("LOG_PEPPER_FILE", LOG_PEPPER_FILE),
    roles: ROLES_FILE,
    chains: CHAINS,
    origins: ORIGINS,
    newAccountsPerHour: NEW_ACCOUNTS_PER_HOUR,
    authSocket: AUTH_SOCKET,
    ergo: ergoOf(env, { host: ERGO_HOST, port: ERGO_PORT, passwordFile: ERGO_OPER_PASSWORD_FILE }),
    ergoData: ergoDataOf(env, ERGO_DATA, ERGO_DATA_MB),
    moderation: {
      openaiKey:
        OPENAI_API_KEY_FILE === undefined ? undefined : new Secret(word("OPENAI_API_KEY_FILE", OPENAI_API_KEY_FILE)),
      thresholds: MODERATION_THRESHOLDS,
      newAccountHours: NEW_ACCOUNT_HOURS,
      mute: { strikes: MUTE_STRIKES, windowMinutes: MUTE_WINDOW_MINUTES, minutes: MUTE_MINUTES, max: MUTE_MAX },
    },
  };
}

// The link to Ergo, or none without the password's file. Ergo's listener named with no password is a link
// meant that would not come: the server stops rather than run silent.
function ergoOf(
  env: Record<string, string | undefined>,
  { host, port, passwordFile }: { host: string; port: number; passwordFile: string | undefined },
): Config["ergo"] {
  if (passwordFile !== undefined) return { host, port, password: word("ERGO_OPER_PASSWORD_FILE", passwordFile) };
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

// A secret that goes on a line as it is (the OPER line, an Authorization header): one word of printable
// ASCII, 256 at most, which the OPER line's 510 bytes hold.
function word(setting: string, path: string): string {
  const text = secret(setting, path);
  if (!/^[\x21-\x7e]+$/.test(text)) throw new Error(`setting ${setting}: invalid_characters`);
  if (text.length > 256) throw new Error(`setting ${setting}: too_long`);
  return text;
}

function secret(setting: string, path: string): string {
  let text: string;
  try {
    text = readFileSync(path, "utf8").trim();
  } catch (cause) {
    throw new Error(`setting ${setting}: unreadable`, { cause });
  }
  if (text.length < 32) throw new Error(`setting ${setting}: too_short`);
  return text;
}
