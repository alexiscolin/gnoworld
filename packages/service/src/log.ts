// JSON lines on stdout, which the log backend reads (ADR-0002 §7). A line holds only the fields named
// here, so what a request carried has nowhere to go; an account is written as its HMAC with the pepper.
import { createHmac } from "node:crypto";

interface Fields {
  account?: string;
  method?: string;
  route?: string;
  status?: number;
  port?: number;
  error?: string;
  // A thrown error's frames, from failureOf: where it failed, never its message.
  stack?: string;
  ms?: number;
  // A room's name, which is public.
  room?: string;
  // A line's id, which Ergo sets and every reader of its room sees.
  msgid?: string;
  // A tool Jarvis's allowlist names, or its fixed word for a name the model made up, and why a call was refused.
  tool?: string;
  reason?: string;
  // An admin's change: the setting, its value, and the account it names, written as its HMAC like the account.
  setting?: string;
  value?: number;
  subject?: string;
  // A moderation act or a link: what gave the right, "owner" or "staff"; the address that holds the namespace, written as
  // its HMAC like the account; the way a link was made.
  as?: "owner" | "staff" | "maker";
  owner?: string;
  kind?: "adena" | "cli";
}
export type Log = (event: string, fields?: Fields) => void;

/** A thrown value as a line may hold it: an Error's name and its stack's frames, never its message, which may quote what a request
 * sent; any other value, its type alone. */
export function failureOf(thrown: unknown): { error: string; stack?: string } {
  if (!(thrown instanceof Error)) return { error: typeof thrown };
  const error = /^\w{1,64}$/.test(thrown.name) ? thrown.name : "Error";
  if (typeof thrown.stack !== "string") return { error };
  // V8 writes the stack on its first read, opening with the error's text (name and message, as Error.prototype.toString gives them),
  // skipped whole. ceiling: a name or message changed after that first read shifts the count, and a line of the message shaped like
  // a frame then passes; nothing here changes either once an error is made.
  const frames = thrown.stack
    .split("\n")
    .slice(Error.prototype.toString.call(thrown).split("\n").length)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("at "));
  return frames.length > 0 ? { error, stack: frames.join("\n") } : { error };
}

export function logger(pepper: string, write: (line: string) => void): Log {
  const hmac = (who: string | undefined): string | undefined =>
    who === undefined ? undefined : createHmac("sha256", pepper).update(who).digest("hex");
  return (event, fields = {}) => {
    const {
      account,
      method,
      route,
      status,
      port,
      error,
      stack,
      ms,
      room,
      msgid,
      tool,
      reason,
      setting,
      value,
      subject,
      as,
      owner,
      kind,
    } = fields;
    const line = {
      time: new Date().toISOString(),
      event,
      method,
      route,
      status,
      port,
      error,
      stack,
      ms,
      room,
      msgid,
      tool,
      reason,
      account: hmac(account),
      setting,
      value,
      subject: hmac(subject),
      as,
      owner: hmac(owner),
      kind,
    };
    write(`${JSON.stringify(line)}\n`);
  };
}
