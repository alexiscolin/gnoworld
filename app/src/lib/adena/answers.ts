// Adena's answers read as outside data (slice 9's plan, 9b): by their type, as the SDK tables them (bin/index.js:785-985),
// each ending a call as a success or a failure with its reason. Nothing here asks Adena anything but the call it is given.
import { z } from "../jitless.ts";

export type CallFailure =
  | "missing"
  | "outdated"
  | "not-connected"
  | "busy"
  | "locked"
  | "wrong-account"
  | "no-account"
  | "declined"
  | "failed"
  | "unsupported"
  | "wrong-network"
  | "malformed";
const MAX_LOG = 2048;

// A failure's type says what it is; a type nobody knows is read by its code (bin/index.js:785-985).
const BY_TYPE = new Map<string, CallFailure>([
  ["NOT_CONNECTED", "not-connected"],
  ["UNRESOLVED_TRANSACTION_EXISTS", "busy"],
  ["WALLET_LOCKED", "locked"],
  ["ACCOUNT_MISMATCH", "wrong-account"],
  ["NO_ACCOUNT", "no-account"],
  ["TRANSACTION_REJECTED", "declined"],
  ["SWITCH_NETWORK_REJECTED", "declined"],
  ["ADD_NETWORK_REJECTED", "declined"],
  ["CONNECTION_REJECTED", "declined"],
  ["UNSUPPORTED_TYPE", "unsupported"],
  ["TRANSACTION_FAILED", "failed"],
  ["INVALID_FORMAT", "failed"],
  ["UNEXPECTED_ERROR", "failed"],
]);
const BY_CODE = new Map<number, CallFailure>([
  [1000, "not-connected"],
  [1001, "busy"],
  [2000, "locked"],
  [3001, "wrong-account"],
  [3002, "no-account"],
  [4000, "declined"],
  [4005, "unsupported"],
]);

const Answer = z.object({
  status: z.enum(["success", "failure"]),
  type: z.string(),
  code: z.optional(z.number()),
  message: z.optional(z.string()),
  data: z.unknown(),
});
export interface Failed {
  ok: false;
  reason: CallFailure;
  type: string;
  log?: string;
}
export type Answered = { ok: true; data: unknown } | Failed;
export const capped = (text: string) => (text.length <= MAX_LOG ? text : text.slice(0, MAX_LOG).toWellFormed());
export const refusal = (reason: CallFailure, type = "", log = ""): Failed =>
  log === "" ? { ok: false, reason, type } : { ok: false, reason, type, log: capped(log) };

// A failure's reason: its type's, else its code's; only a plain failure carries Adena's message, as the log.
function failure(type: string, code: number | undefined, message: string | undefined): Failed {
  const reason = BY_TYPE.get(type) ?? BY_CODE.get(code ?? 0) ?? "failed";
  return refusal(reason, type, reason === "failed" ? (message ?? "") : "");
}

// One call to the extension, its answer read by its type: one of the call's successes, or a failure with its reason.
export async function ask(run: () => unknown, successes: readonly string[]): Promise<Answered> {
  let raw: unknown;
  try {
    raw = await run();
  } catch {
    return refusal("failed");
  }
  const parsed = Answer.safeParse(raw);
  if (!parsed.success) return refusal("malformed");
  const { status, type, code, message, data } = parsed.data;
  const named = successes.includes(type);
  // "Already connected" is a failure in the SDK's table, and the SDK reads it as connected.
  if (named && (status === "success" || type === "ALREADY_CONNECTED")) return { ok: true, data };
  return status === "success" || named ? refusal("malformed", type) : failure(type, code, message);
}

export type Read<T> = { ok: true; value: T } | Failed;
export async function read<T>(
  run: () => unknown,
  successes: readonly string[],
  schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false } },
): Promise<Read<T>> {
  const answered = await ask(run, successes);
  if (!answered.ok) return answered;
  const parsed = schema.safeParse(answered.data);
  return parsed.success ? { ok: true, value: parsed.data } : refusal("malformed");
}
