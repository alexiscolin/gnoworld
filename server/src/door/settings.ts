// The door's settings and the admin API's (docs/plans/slice-10.md, 10g; D92 to D96), read with the server's own
// (config.ts), each none by default: no JARVIS_URL, no door, and Jarvis off unless JARVIS=on; no ADMIN_PORT, no admin
// API. A setting of either given
// without the one that opens it stops the server, as a door meant that would not open. The quotas and the allowlist
// here are first values alone: the database keeps them from the first start (quota.ts).
import { Address, DOOR_CAPS } from "@gnoworld/schemas";
import { z } from "zod";
import { isOrigin, list, port, whole } from "@gnoworld/service/settings";

export interface DoorConfig {
  // Jarvis switched on: JARVIS=on exactly; off by default, and for any other value (Alexis, off by default).
  on: boolean;
  // jarvis's address on the network only the two share (D42): a bare origin.
  url: string;
  timeoutMs: number;
  questionChars: number;
  first: { quota: number; quotaUnnamed: number; unlimited: Address[] };
  // The mainnet's RPC, where an account's name is read (names.ts): a bare https origin.
  namesRpc: string;
}

export interface AdminConfig {
  host: string;
  port: number;
  origins: string[];
}

type Env = Record<string, string | undefined>;

/** The settings' schemas, merged into the server's: built at each read, so a test runs the checks it proves. */
export function doorSettings() {
  const unique = (entries: readonly string[]): boolean => new Set(entries).size === entries.length;
  return {
    // Any text at all: only `on` switches Jarvis on, and no value stops the server.
    JARVIS: z.string().optional(),
    JARVIS_URL: z.string().refine(isOrigin).optional(),
    // Longer than the loop's worst: 8 turns of 3 attempts of 60 s, and a minute for its tools (D94).
    JARVIS_TIMEOUT_S: whole(3600, 1500),
    JARVIS_QUESTION_CHARS: whole(DOOR_CAPS.question, 2000),
    JARVIS_QUOTA: whole(DOOR_CAPS.quota, 20),
    JARVIS_QUOTA_UNNAMED: whole(DOOR_CAPS.quota, 5),
    JARVIS_UNLIMITED: list(Address)
      .refine(unique)
      .refine((entries) => entries.length <= DOOR_CAPS.unlimited),
    JARVIS_NAMES_RPC: z
      .string()
      .refine((text) => isOrigin(text) && text.startsWith("https:"))
      .default("https://rpc.gno.land"),
    ADMIN_HOST: z.string().min(1).max(253).default("127.0.0.1"),
    ADMIN_PORT: port().optional(),
    ADMIN_ORIGINS: list(z.string().refine(isOrigin)),
  };
}

type Settings = z.infer<z.ZodObject<ReturnType<typeof doorSettings>>>;

/** An admin site on a host a public page is served from, by its place, whatever its scheme or port: cookies ignore both
 * (RFC 6265 §8.5), and a flaw in a public page must never reach the console (ADR-0002 §6). */
export function apartFromPublic(
  { ORIGINS, ADMIN_ORIGINS }: { ORIGINS: string[]; ADMIN_ORIGINS: string[] },
  ctx: z.RefinementCtx,
): void {
  // An entry that is no origin has its own issue already: it parts no host here.
  const hostname = (origin: string): string | undefined => URL.parse(origin)?.hostname;
  const publicHosts = new Set(ORIGINS.map(hostname));
  for (const [at, origin] of ADMIN_ORIGINS.entries())
    if (publicHosts.has(hostname(origin) ?? "")) ctx.addIssue({ code: "custom", path: ["ADMIN_ORIGINS", at] });
}

// A setting of `names` given without `opener`: the server stops, naming the one missing.
function needs(env: Env, opener: string, names: readonly string[]): void {
  if (names.some((name) => env[name] !== undefined)) throw new Error(`setting ${opener}: required`);
}

/** The door, or none without jarvis's address. */
export function doorOf(env: Env, settings: Settings): DoorConfig | undefined {
  const { JARVIS_URL, JARVIS_TIMEOUT_S, JARVIS_QUESTION_CHARS, JARVIS_QUOTA, JARVIS_QUOTA_UNNAMED } = settings;
  if (JARVIS_URL === undefined) {
    needs(
      env,
      "JARVIS_URL",
      Object.keys(doorSettings()).filter((name) => name.startsWith("JARVIS_")),
    );
    return undefined;
  }
  return {
    on: settings.JARVIS === "on",
    url: JARVIS_URL,
    timeoutMs: JARVIS_TIMEOUT_S * 1000,
    questionChars: JARVIS_QUESTION_CHARS,
    first: { quota: JARVIS_QUOTA, quotaUnnamed: JARVIS_QUOTA_UNNAMED, unlimited: settings.JARVIS_UNLIMITED },
    namesRpc: settings.JARVIS_NAMES_RPC,
  };
}

/** The admin API's listener, or none without its port. */
export function adminOf(env: Env, { ADMIN_HOST, ADMIN_PORT, ADMIN_ORIGINS }: Settings): AdminConfig | undefined {
  if (ADMIN_PORT !== undefined) return { host: ADMIN_HOST, port: ADMIN_PORT, origins: ADMIN_ORIGINS };
  needs(env, "ADMIN_PORT", ["ADMIN_HOST", "ADMIN_ORIGINS"]);
  return undefined;
}
