// What every process's settings share (ADR-0002 §7): read from the environment and checked at start, a secret only
// from the file a *_FILE setting names, held in a value that never prints, and an error that names the setting and
// its fault, never its value. `server` (config.ts) and `jarvis` (jarvis/config.ts) read theirs through these.
import { readFileSync } from "node:fs";
import { z } from "zod";

// A secret that never prints: inspect, JSON and a template string show [redacted]; reveal() reads it.
export class Secret {
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

// A whole number from 1 to `max`, written plainly: no sign, no leading zero, no point.
export const whole = (max: number, otherwise: number) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().max(max))
    .default(otherwise);

// A port, written plainly, 0 for one the system picks.
export const port = () =>
  z
    .string()
    .regex(/^(0|[1-9]\d{0,4})$/)
    .transform(Number)
    .pipe(z.number().max(65_535));

// A list of entries parted by commas, none when empty, each checked by `item`.
export const list = <T extends z.ZodType<unknown, string>>(item: T) =>
  z
    .string()
    .default("")
    .transform((text) => (text === "" ? [] : text.split(",")))
    .pipe(z.array(item));

// An origin as a browser sends it: scheme, host and port, nothing else (an Origin header compares to it).
export function isOrigin(text: string): boolean {
  const url = URL.parse(text);
  return url !== null && ["http:", "https:"].includes(url.protocol) && url.origin === text;
}

// An absolute path whose every part is a name (no "", "." or ".."), so never the root a walk would take whole (F636).
export const absolute = z.string().refine((path) => {
  const [root, ...parts] = path.split("/");
  return root === "" && parts.length > 0 && parts.every((part) => !["", ".", ".."].includes(part));
});

// A SQLite file's path, or ":memory:".
export const databasePath = z.string().min(1).max(1024);

// The settings a schema reads, or an error naming the first wrong one and its fault, never its value.
export function parseSettings<T>(schema: z.ZodType<T>, env: Record<string, string | undefined>): T {
  const parsed = schema.safeParse(env);
  if (parsed.success) return parsed.data;
  // The path and the code only: a message may quote the value.
  const issue = parsed.error.issues[0];
  // A list's entry by its place, so a deploy knows which one; its value stays out.
  const [setting, ...place] = issue?.path ?? [];
  const at = place.length > 0 ? ` (at ${place.map(String).join(".")})` : "";
  throw new Error(`setting ${String(setting)}: ${issue?.code ?? "invalid"}${at}`);
}

// A secret that goes on a line as it is (the OPER line, an Authorization header): one word of printable
// ASCII, 256 at most, which the OPER line's 510 bytes hold.
export function readWord(setting: string, path: string): string {
  const text = readSecret(setting, path);
  if (!/^[\x21-\x7e]+$/.test(text)) throw new Error(`setting ${setting}: invalid_characters`);
  if (text.length > 256) throw new Error(`setting ${setting}: too_long`);
  return text;
}

export function readSecret(setting: string, path: string): string {
  let text: string;
  try {
    text = readFileSync(path, "utf8").trim();
  } catch (cause) {
    throw new Error(`setting ${setting}: unreadable`, { cause });
  }
  if (text.length < 32) throw new Error(`setting ${setting}: too_short`);
  return text;
}
