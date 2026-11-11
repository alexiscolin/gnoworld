// The door's settings and the admin API's (docs/plans/slice-10.md, 10g; D92 to D96), read with the server's own
// (config.ts), each none by default: no JARVIS_URL, no door, and Jarvis off unless JARVIS=on; no ADMIN_PORT, no admin
// API. A setting of either given
// without the one that opens it stops the server, as a door meant that would not open. The quotas and the allowlist
// here are first values alone: the database keeps them from the first start (quota.ts).
import { Address, ASK_WAIT_S, DOOR_CAPS } from "@gnoworld/schemas";
import { z } from "zod";
import { host, isOrigin, keyFile, list, port, type Secret, whole } from "@gnoworld/service/settings";

export interface DoorConfig {
  // Jarvis switched on: JARVIS=on exactly; off by default, and for any other value (Alexis, off by default).
  on: boolean;
  // jarvis's address on the network only the two share (D42): a bare origin.
  url: string;
  // What the door proves itself to jarvis with, in a header of every request; required once jarvis is on (10u-g2).
  key: Secret | undefined;
  timeoutMs: number;
  questionChars: number;
  first: { quota: number; quotaUnnamed: number; unlimited: Address[] };
  // The mainnet's RPC, where an account's name is read (names.ts): a bare https origin; and its chain's id, which the
  // node's status must name (D120).
  namesRpc: string;
  namesChain: string;
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
    JARVIS_DOOR_KEY_FILE: z.string().min(1).optional(),
    // At most what the page waits for less 10 s, and longer than the loop's worst, 874 s (ASK_WAIT_S in schemas).
    JARVIS_TIMEOUT_S: whole(ASK_WAIT_S.door, ASK_WAIT_S.door),
    JARVIS_QUESTION_CHARS: whole(DOOR_CAPS.question, 500),
    JARVIS_QUOTA: whole(DOOR_CAPS.quota, 20),
    JARVIS_QUOTA_UNNAMED: whole(DOOR_CAPS.quota, 5),
    JARVIS_UNLIMITED: list(Address)
      .refine(unique)
      .refine((entries) => entries.length <= DOOR_CAPS.unlimited),
    JARVIS_NAMES_RPC: z
      .string()
      .refine((text) => isOrigin(text) && text.startsWith("https:"))
      .default("https://rpc.gno.land"),
    // A chain's id: 50 characters at most (tm2/pkg/bft/types/genesis.go:18, MaxChainIDLen), letters, digits, `.`, `_`, `-`.
    JARVIS_NAMES_CHAIN: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$/)
      .default("gnoland-1"),
    ADMIN_HOST: host(),
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
  const on = settings.JARVIS === "on";
  return {
    on,
    url: JARVIS_URL,
    key: keyFile("JARVIS_DOOR_KEY_FILE", settings.JARVIS_DOOR_KEY_FILE, on),
    timeoutMs: JARVIS_TIMEOUT_S * 1000,
    questionChars: JARVIS_QUESTION_CHARS,
    first: { quota: JARVIS_QUOTA, quotaUnnamed: JARVIS_QUOTA_UNNAMED, unlimited: settings.JARVIS_UNLIMITED },
    namesRpc: settings.JARVIS_NAMES_RPC,
    namesChain: settings.JARVIS_NAMES_CHAIN,
  };
}

/** The admin API's listener, or none without its port. */
export function adminOf(env: Env, { ADMIN_HOST, ADMIN_PORT, ADMIN_ORIGINS }: Settings): AdminConfig | undefined {
  if (ADMIN_PORT !== undefined) return { host: ADMIN_HOST, port: ADMIN_PORT, origins: ADMIN_ORIGINS };
  needs(env, "ADMIN_PORT", ["ADMIN_HOST", "ADMIN_ORIGINS"]);
  return undefined;
}
