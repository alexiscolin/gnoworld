// The server's settings, from the environment, checked at start (ADR-0002 §7): a secret only ever
// comes from the file a *_FILE setting names, and an error names the setting, never its value.
import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { z } from "zod";

export interface Config {
  host: string;
  port: number;
  database: string;
  trustedProxy: string | undefined;
  pepper: string;
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
});

export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    // The path and the code only: a message may quote the value.
    const issue = parsed.error.issues[0];
    throw new Error(`setting ${String(issue?.path[0])}: ${issue?.code ?? "invalid"}`);
  }
  const { HOST, PORT, DATABASE, TRUSTED_PROXY, LOG_PEPPER_FILE } = parsed.data;
  return {
    host: HOST,
    port: PORT,
    database: DATABASE,
    trustedProxy: TRUSTED_PROXY,
    pepper: secret("LOG_PEPPER_FILE", LOG_PEPPER_FILE),
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
