// Jarvis's loop (ADR-0002 §5, "Harness"): one question to an answer through our own small loop, not the SDK's tool
// runner, as every call must pass our checks first. The system prompt is frozen per version and cached; the question
// and the room's lines go in as untrusted blocks under the question's one tag (D80); each turn reserves, calls and
// settles the model (model.ts), then each tool call passes the allowlist and the tag's check, eight a turn at most, runs
// with the question's words and own cards (D103), its result cut and wrapped. It stops at the answer, with its cards,
// the turn cap, max_tokens, a refusal (D81), an error, an unasked stop, the budget (D84), or its asker gone (D177).
import { createHash, randomBytes } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { isBlank } from "@gnoworld/core";
import type { Tracer } from "@opentelemetry/api";
import type { Log } from "@gnoworld/service/log";
import type { Allowlist, Definition } from "./allowlist.ts";
import type { Budget } from "./budget.ts";
import type { JarvisConfig } from "./config.ts";
import { keepOf, type Reads, opening, stopOf, systemOf, unanswered } from "./loopParts.ts";
import { callsDecline, DECLINE, millionths } from "./decline.ts";
import { callModel, type Request, type Send, type Wait } from "./model.ts";
import type { Model } from "./prices.ts";
import { keepCards, type Cards, type Kept } from "./tools/kept.ts";
import { resultsOf, type Runs } from "./toolRun.ts";
import { traceQuestion, type Trace } from "./tracing.ts";
import { untrustedBlocks, type Untrusted } from "./untrusted.ts";

/** A question: its words, its room's lines, each a text, what the server read for it by source, and a `finds`: the function a read of its realm's code must hold for the answer to be kept (D13920). */
export interface Question {
  readonly text: string;
  readonly room: readonly string[];
  readonly read?: readonly { readonly source: string; readonly text: string }[];
  readonly finds?: { readonly realm: string; readonly name: string };
}
/** How a question ended: its answer and its cards, or why there is none. `cost` is what the budget settled for the
 * question's turns, in millionths of a dollar, on every end that spent; `invalid` and `gone` carry none, and `spent` only when earlier turns spent. */
export type Result =
  | {
      readonly kind: "answer";
      readonly text: string;
      readonly cards: Cards;
      readonly cost: number;
      readonly keep?: boolean;
    }
  | { readonly kind: "declined" | "turns" | "max_tokens"; readonly cost: number }
  | { readonly kind: "spent"; readonly cost?: number }
  | { readonly kind: "invalid" | "gone" }
  | { readonly kind: "refusal"; readonly category: string | null; readonly cost: number }
  | { readonly kind: "failed"; readonly reason: "error" | "timeout" | "stop"; readonly cost: number };
type Offered = ReturnType<Allowlist<Definition>["offered"]>;

export interface Parts {
  readonly send: Send;
  readonly budget: Budget;
  readonly log: Log;
  readonly tracer: Tracer;
  readonly model: Model;
  readonly caps: JarvisConfig["caps"];
  readonly skills: { readonly index: readonly { name: string; description: string }[]; readonly digest: string };
  readonly tools: { readonly allowlist: Allowlist<Definition>; readonly run: Runs };
  // The system prompt of a loop with one job, such as a realm's digest, in place of the concierge's.
  readonly system?: string | undefined;
  // The tag's random source, node:crypto's by default; a tool's time, 30 s by default; the wait between attempts.
  readonly random?: ((size: number) => Uint8Array) | undefined;
  readonly toolTimeoutMs?: number | undefined;
  readonly wait?: Wait | undefined;
}
// A question as it runs: its words, its cards, its blocks, its trace, its conversation, its count of the model's answers.
export interface Run {
  readonly parts: Parts;
  readonly question: string;
  readonly kept: Kept;
  readonly blocks: Untrusted;
  readonly trace: Trace;
  readonly messages: Anthropic.MessageParam[];
  // A tool's name when it is one of the loop's tools, else none.
  readonly named: (name: string) => string | undefined;
  // The question's: fired once its asker left.
  readonly signal: AbortSignal;
  readonly reads: Reads;
  // What the budget settled for this question's attempts, in nano-dollars.
  readonly paid: { nano: number };
  turns: number;
}

/** The SHA-256 of texts, each framed by its length in bytes, so no two lists of parts give one hash. */
export function hashParts(parts: readonly string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(`${String(Buffer.byteLength(part))}\0`).update(part);
  return hash.digest("hex");
}

/** The loop for these parts, and its prompt's version: the SHA-256 of its system prompt, skills and tools. */
export function makeLoop(parts: Parts) {
  const system = parts.system ?? systemOf(parts.skills.index);
  // The concierge's loop, not a one-job loop with its own system prompt, is the one that may decline.
  const offered =
    parts.system === undefined ? [...parts.tools.allowlist.offered(), DECLINE] : parts.tools.allowlist.offered();
  const version = hashParts([system, parts.skills.digest, JSON.stringify(offered)]);
  const tools = new Set(parts.tools.allowlist.offered().map(({ name }) => name));
  const named = (name: string) => (tools.has(name) ? name : undefined);
  return {
    version,
    ask: (question: Question, signal = new AbortController().signal) =>
      ask(parts, { system, version, named, offered }, { question, signal }),
  };
}

interface Prompt {
  readonly system: string;
  readonly version: string;
  readonly named: Run["named"];
  readonly offered: Offered;
}

async function ask(parts: Parts, prompt: Prompt, asked: { question: Question; signal: AbortSignal }): Promise<Result> {
  const { question, signal } = asked;
  const started = performance.now();
  const trace = traceQuestion(parts.tracer, { model: parts.model, version: prompt.version });
  const blocks = untrustedBlocks({ limit: parts.caps.toolResultBytes, random: parts.random ?? randomBytes });
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opening(blocks, question) }];
  const kept = keepCards();
  const { named } = prompt;
  const run: Run = {
    parts,
    question: question.text,
    kept,
    blocks,
    trace,
    messages,
    named,
    signal,
    reads: { finds: question.finds, failed: false, found: false },
    paid: { nano: 0 },
    turns: 0,
  };
  let word = "thrown";
  try {
    const result = askable(question.text, parts.caps.questionChars) ? await converse(run, prompt) : invalid();
    word = result.kind === "failed" ? `failed_${result.reason}` : result.kind;
    return result;
  } finally {
    trace.end(word, run.turns);
    parts.log("jarvis_answered", { reason: word, ms: Math.round(performance.now() - started) });
  }
}

const invalid = (): Result => ({ kind: "invalid" });
// A character that draws something (core's isBlank), and no more code points than the cap: a text of more than twice as
// many code units has more.
const askable = (text: string, cap: number) =>
  text.length <= 2 * cap && Array.from(text).length <= cap && !isBlank(text);

async function converse(run: Run, prompt: Prompt): Promise<Result> {
  const { parts, trace } = run;
  const attempts = { ...parts, retries: parts.caps.retries, trace, signal: run.signal, paid: run.paid };
  for (;;) {
    // callModel asks nothing once the asker left: it answers gone (D177).
    const called = await callModel(attempts, requestOf(parts, prompt, run.messages));
    if (!called.ok) return unanswered(run.paid, called.reason);
    run.turns += 1;
    const over = endOf(run, called.answer);
    if (over !== undefined) return over;
    const results = await resultsOf(run, called.answer.content);
    run.messages.push({ role: "assistant", content: called.answer.content }, { role: "user", content: results });
  }
}

// How the question ends on this answer, with what it cost, or none: a decline ends it before the turn cap, the other
// calls of its turn and any text.
function endOf(run: Run, answer: Anthropic.Message): Result | undefined {
  const { parts, kept, paid } = run;
  const cost = millionths(paid.nano);
  if (parts.system === undefined && callsDecline(answer.content)) return { kind: "declined", cost };
  const stop = stopOf(answer, run.turns, parts.caps.turns);
  if (stop?.kind === "answer") return { ...stop, cards: kept.cards(), cost, ...keepOf(run.reads) };
  return stop === undefined ? undefined : { ...stop, cost };
}

// Tools and system render first and are the same bytes each turn: one breakpoint on the system prompt caches both,
// and the request's own asks the turns that follow cached (the claude-api skill, shared/prompt-caching.md).
const requestOf = (
  parts: Parts,
  { system, offered }: Prompt,
  messages: Anthropic.MessageParam[],
): Request & { model: Model } => ({
  model: parts.model,
  max_tokens: parts.caps.outputTokens,
  system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
  tools: offered,
  messages: [...messages],
  cache_control: { type: "ephemeral" },
  // Thinking counts toward max_tokens; at low effort the model thinks little on a plain question (D84).
  output_config: { effort: "low" },
});
