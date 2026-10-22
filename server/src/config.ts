// The server's settings, from the environment, checked at start (ADR-0002 §7): a secret only ever
// comes from the file a *_FILE setting names, and an error names the setting, never its value.
import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import { z } from "zod";

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
}

// An origin as a browser sends it: scheme, host and port, nothing else (an Origin header compares to it).
function isOrigin(text: string): boolean {
  const url = URL.parse(text);
  return url !== null && ["http:", "https:"].includes(url.protocol) && url.origin === text;
}

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
});

export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    // The path and the code only: a message may quote the value.
    const issue = parsed.error.issues[0];
    throw new Error(`setting ${String(issue?.path[0])}: ${issue?.code ?? "invalid"}`);
  }
  const { HOST, PORT, DATABASE, TRUSTED_PROXY, LOG_PEPPER_FILE, ROLES_FILE, CHAINS, ORIGINS, NEW_ACCOUNTS_PER_HOUR } =
    parsed.data;
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
  };
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
