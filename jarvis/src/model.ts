// Jarvis's one door to Anthropic's API (ADR-0002 §5): the SDK's client is made here alone, with the key and D44's
// timeout, retrying nothing itself, so each attempt is reserved and settled on its own (D69); every request goes to
// the global inference at the standard tier, the only place and tier `cost` prices (F5177, D82). callModel makes one
// model request of the loop's: its attempts, two retries at most of what the SDK itself would retry (D83).
import { setTimeout as sleep } from "node:timers/promises";
import Anthropic, {
  AnthropicError,
  APIConnectionError,
  APIConnectionTimeoutError,
  type ClientOptions,
} from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Log } from "@gnoworld/service/log";
import type { Secret } from "@gnoworld/service/settings";
import type { Budget, Kind } from "./budget.ts";
import { cost, worstCost, type Model } from "./prices.ts";
import type { Trace } from "./tracing.ts";

export type Request = Anthropic.MessageCreateParamsNonStreaming;
/** One attempt of a model request, which the question's signal ends: its answer, or the SDK's error. */
export type Send = (request: Request, signal?: AbortSignal) => Promise<Anthropic.Message>;

// Where and how every request is billed, whatever the caller sent.
const pinned = (request: Request): Request => ({ ...request, inference_geo: "global", service_tier: "standard_only" });

/** The SDK's one client, as a Send; throws when the environment would add headers to its requests. */
export function connectAnthropic(key: Secret, timeoutMs: number, fetch?: ClientOptions["fetch"]): Send {
  // The SDK adds this variable's headers to every request (SDK 1.4.0, client.js), a beta among them.
  if (process.env["ANTHROPIC_CUSTOM_HEADERS"] !== undefined) {
    throw new Error("model: ANTHROPIC_CUSTOM_HEADERS is set, and jarvis sends no header of its environment's");
  }
  const client = new Anthropic({
    apiKey: key.reveal(),
    baseURL: "https://api.anthropic.com",
    timeout: timeoutMs,
    maxRetries: 0,
    logLevel: "off",
    openTelemetry: false,
    fetchOptions: { redirect: "error" },
    fetch,
  });
  return (request, signal) => client.messages.create(pinned(request), { signal });
}

/** The wait before a retry, ended by the question's signal, as node:timers' own is. */
export type Wait = (ms: number, value?: undefined, options?: { signal?: AbortSignal | undefined }) => Promise<unknown>;
interface Attempts {
  readonly send: Send;
  readonly budget: Budget;
  // The budget each attempt reserves from: a question's, unless a translation's (ADR-0002 §5, "its own budget").
  readonly kind?: Kind | undefined;
  readonly retries: number;
  readonly log: Log;
  readonly trace: Trace;
  readonly wait?: Wait | undefined;
  // The question's: once its asker left, nothing more is sent, waited for or retried (D177).
  readonly signal?: AbortSignal | undefined;
}
type Called = { ok: true; answer: Anthropic.Message } | { ok: false; reason: "spent" | "failed" | "timeout" | "gone" };
type Tried = Called | { ok: false; reason: "error"; error: AnthropicError };

const kindOf = ({ kind }: Attempts): Kind => kind ?? "ask";

/** One model request: each attempt reserved at its worst before it is sent and settled once it ends. */
export async function callModel(attempts: Attempts, request: Request & { model: Model }): Promise<Called> {
  const sent = pinned(request);
  const inputBytes = Buffer.byteLength(JSON.stringify(sent));
  const worst = worstCost(request.model, { inputBytes, maxTokens: request.max_tokens });
  const { signal } = attempts;
  for (let attempt = 1; ; attempt += 1) {
    if (signal?.aborted === true) return { ok: false, reason: "gone" };
    const tried = await tryOnce(attempts, { sent, worst, kind: kindOf(attempts) }, attempt);
    if (tried.ok || tried.reason !== "error") return tried;
    const delay = attempt > attempts.retries ? undefined : delayOf(tried.error, attempt);
    if (delay === undefined) {
      return { ok: false, reason: tried.error instanceof APIConnectionTimeoutError ? "timeout" : "failed" };
    }
    // node:timers' wait rejects once the signal fires: the next attempt then finds the asker gone.
    await (attempts.wait ?? sleep)(delay, undefined, { signal }).catch((error: unknown) => {
      if (signal?.aborted !== true) throw error;
    });
  }
}

async function tryOnce(
  attempts: Attempts,
  { sent, worst, kind }: { sent: Request; worst: number; kind: Kind },
  attempt: number,
): Promise<Tried> {
  const { budget, log, trace } = attempts;
  const held = budget.reserve(kind, worst);
  for (const level of held.alerts) {
    log("jarvis_budget_alert", { reason: String(level) });
    trace.alert(level);
  }
  if (!held.ok) return { ok: false, reason: "spent" };
  const span = trace.request(attempt);
  try {
    const answer = await attempts.send(sent, attempts.signal);
    span.answered(answer, settled(attempts, held.hold, cost(answer.model, answer.usage)));
    return { ok: true, answer };
  } catch (error) {
    span.failed(
      error instanceof Error ? error.constructor.name : "unknown",
      settled(attempts, held.hold, failedCost(error)),
    );
    // The SDK ends a request whose signal fired with its own error: the asker left, no model's fault.
    if (attempts.signal?.aborted === true) return { ok: false, reason: "gone" };
    if (!(error instanceof AnthropicError)) throw error;
    const status = answeredOf(error)?.status;
    log("jarvis_model_error", { error: error.constructor.name, ...(status === undefined ? {} : { status }) });
    return { ok: false, reason: "error", error };
  }
}

// An attempt with no answer: one answered 429 or 529 ran nothing and costs nothing (V2, Alexis); any other is charged its
// worst (undefined), for it may have been billed (D69).
function failedCost(error: unknown): 0 | undefined {
  const status = error instanceof AnthropicError ? answeredOf(error)?.status : undefined;
  return status === 429 || status === 529 ? 0 : undefined;
}

// What the budget charged, or nothing it could say for a hold already spent at its deadline.
function settled({ budget, log }: Attempts, hold: { readonly id: number }, real: number | undefined) {
  const settlement = budget.settle(hold, real);
  if (settlement.status !== "settled") log("jarvis_budget_settle", { reason: settlement.status });
  return settlement.status === "gone" ? undefined : settlement.charged;
}

// The wait before the next attempt, or none when the SDK would not retry: a dropped or timed-out connection, or the
// API's x-should-retry, else 408, 409, 429 and 5xx (SDK 1.4.0's shouldRetry); what the API asks, up to 8 s.
function delayOf(error: AnthropicError, attempt: number): number | undefined {
  // Up to a quarter off at random, as the SDK does, so the questions a 429 or a 529 stops do not retry in step.
  const backoff = Math.min(500 * 2 ** (attempt - 1), 8_000) * (1 - Math.random() * 0.25);
  if (error instanceof APIConnectionError) return backoff;
  const answered = answeredOf(error);
  if (answered === undefined || !retried(answered)) return undefined;
  const asked = askedWait(answered.headers);
  if (asked === undefined) return backoff;
  return asked <= 8_000 ? asked : undefined;
}

// The status and headers of an error the API answered with: `instanceof APIError` would type its generics as any.
function answeredOf(error: AnthropicError): { status: number; headers?: Headers | undefined } | undefined {
  const parsed = z.object({ status: z.number(), headers: z.instanceof(Headers).optional() }).safeParse(error);
  return parsed.success ? parsed.data : undefined;
}

function retried({ status, headers }: { status: number; headers?: Headers | undefined }): boolean {
  const told = headers?.get("x-should-retry");
  if (told === "true" || told === "false") return told === "true";
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

// retry-after-ms, else retry-after in seconds; a date, zero or no number asks nothing.
function askedWait(headers: Headers | undefined): number | undefined {
  const millis = Number.parseFloat(String(headers?.get("retry-after-ms")));
  const asked = Number.isNaN(millis) ? Number.parseFloat(String(headers?.get("retry-after"))) * 1000 : millis;
  return asked > 0 ? asked : undefined;
}
