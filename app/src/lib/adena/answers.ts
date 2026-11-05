// Adena's answers read as outside data (slice 9's plan, 9b): by their type, as the SDK tables them (bin/index.js:785-985),
// each ending a call as a success or a failure with its reason. Nothing here asks Adena anything but the call it is given.
import { ChallengeRequest } from "@gnoworld/schemas";
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
  | "maybe-sent"
  | "declined-maybe-sent"
  | "unsupported"
  | "wrong-network"
  | "malformed";
const MAX_LOG = 2048;
/** The name Adena shows for gnoworld when it asks to let it in. */
export const SITE = "gnoworld";

/**
 * Each Adena method's success types, once, for the login and for a call. Adena answers GET_NETWORK
 * (app/recording/adena-recording.json, entry 1), so GET_NETWORK_SUCCESS is not taken (D230).
 */
export const SUCCESSES = {
  AddEstablish: ["CONNECTION_SUCCESS", "ALREADY_CONNECTED"],
  GetAccount: ["GET_ACCOUNT"],
  GetNetwork: ["GET_NETWORK"],
  SwitchNetwork: ["SWITCH_NETWORK_SUCCESS"],
  AddNetwork: ["ADD_NETWORK_SUCCESS"],
  SignArbitrary: ["SIGN_ARBITRARY"],
  DoContract: ["TRANSACTION_SUCCESS"],
} as const;
export type Method = keyof typeof SUCCESSES;

export interface Failed {
  ok: false;
  reason: CallFailure;
  type: string;
  log?: string;
  /** The hash of a transaction Adena named in a failure: it was signed, so it may be on the chain. */
  hash?: string;
}
export type Answered = { ok: true; data: unknown } | Failed;
export const capped = (text: string) => (text.length <= MAX_LOG ? text : text.slice(0, MAX_LOG).toWellFormed());
export const refusal = (reason: CallFailure, type = "", log = ""): Failed =>
  log === "" ? { ok: false, reason, type } : { ok: false, reason, type, log: capped(log) };

// A failure's reason: its type's, else its code's; only a plain failure carries Adena's message, as the log.
function failure(type: string, code: number | undefined, message: string | undefined): Failed {
  // A failure's type says what it is; a type nobody knows is read by its code (bin/index.js:785-985).
  const BY_TYPE = new Map<string, CallFailure>([
    ["NOT_CONNECTED", "not-connected"],
    ["UNRESOLVED_TRANSACTION_EXISTS", "busy"],
    ["WALLET_LOCKED", "locked"],
    ["ACCOUNT_MISMATCH", "wrong-account"],
    ["NO_ACCOUNT", "no-account"],
    ["TRANSACTION_REJECTED", "declined"],
    ["SIGN_REJECTED", "declined"],
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
  const reason = BY_TYPE.get(type) ?? BY_CODE.get(code ?? 0) ?? "failed";
  return refusal(reason, type, reason === "failed" ? (message ?? "") : "");
}

// What a failure's data carries (adena-wallet bc5a7b5a, approve-transaction-main/index.tsx:596-633): the hash of a
// transaction it signed, and why it failed: the chain's `log` (a TM2Error only), else `error` (null for a null response).
function detailOf(data: unknown): { hash: string; why?: string } | undefined {
  const Data = z.object({
    hash: z.string().check(z.regex(/^[0-9a-f]{64}$/i)),
    log: z.optional(z.unknown()),
    error: z.optional(z.unknown()),
  });
  const parsed = Data.safeParse(data);
  if (!parsed.success) return undefined;
  const { hash, log, error } = parsed.data;
  const why = [log, error].find((text) => typeof text === "string");
  return typeof why === "string" ? { hash, why } : { hash };
}

// One call to the extension, its answer read by its type: one of the method's successes, or a failure with its reason.
export async function ask(run: () => unknown, method: Method): Promise<Answered> {
  const Answer = z.object({
    status: z.enum(["success", "failure"]),
    type: z.string(),
    code: z.optional(z.number()),
    message: z.optional(z.string()),
    data: z.unknown(),
  });
  let raw: unknown;
  try {
    raw = await run();
  } catch {
    return refusal("failed");
  }
  const parsed = Answer.safeParse(raw);
  if (!parsed.success) return refusal("malformed");
  const { status, type, code, message, data } = parsed.data;
  const named = (SUCCESSES[method] as readonly string[]).includes(type);
  // "Already connected" is a failure in the SDK's table, and the SDK reads it as connected.
  if (named && (status === "success" || type === "ALREADY_CONNECTED")) return { ok: true, data };
  // A success type of any method, typed as a failure or by another method, has no business there: malformed, and it keeps
  // no type, so a caller that branches on one must not read it as a real failure (F5666).
  const anySuccess = Object.values(SUCCESSES).some((types) => (types as readonly string[]).includes(type));
  if (status === "success" || anySuccess) return refusal("malformed");
  const failed = failure(type, code, message);
  const detail = detailOf(data);
  if (detail === undefined) return failed;
  // With a hash, the reason is the chain's, never Adena's generic message (F5749); only a plain failure has one.
  const { hash, why } = detail;
  return failed.reason === "failed" ? { ...refusal("failed", type, why), hash } : { ...failed, hash };
}

export type Read<T> = { ok: true; value: T } | Failed;
export async function read<T>(
  run: () => unknown,
  method: Method,
  schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false } },
): Promise<Read<T>> {
  const answered = await ask(run, method);
  if (!answered.ok) return answered;
  const parsed = schema.safeParse(answered.data);
  return parsed.success ? { ok: true, value: parsed.data } : refusal("malformed");
}

// The chain as the server's challenge takes it, not blank; the address stays the caller's to read, for it says why not.
const Chain = ChallengeRequest.shape.chainId.check(z.refine((chain) => chain.trim() !== ""));
export const Account = z.object({ address: z.string(), chainId: Chain });
export const Network = z.object({ chainId: Chain });
