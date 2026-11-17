// Jarvis's loop (ADR-0002 §5, "Harness"). It takes one question to an answer through our own small loop
// instead of the SDK's tool runner, because every call must pass our checks first. The system prompt is
// frozen for each version and cached. The question and the room's lines go in as untrusted blocks, all
// under the question's single tag. Each turn reserves budget, calls the model, and settles the cost
// (model.ts). Then each tool call, at most eight per turn, must pass the allowlist and the tag's check.
// It runs with the question's words and the question's own cards, and its result is cut short and wrapped.
// The loop stops at an answer (returned with its cards), at the turn cap, at max_tokens, at a refusal,
// at an error, at a stop nobody asked for, when the budget runs out, or when the asker has gone.
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

/** A question. It has its words, the lines of its room (each a text), and what the server read for it, by source.
 * It may also have `finds`: a function that the read of the realm's code must contain for the answer to be kept. */
export interface Question {
  readonly text: string;
  readonly room: readonly string[];
  readonly read?: readonly { readonly source: string; readonly text: string }[];
  readonly finds?: { readonly realm: string; readonly name: string };
  /** A fixed ask, whose answer is shared: its cards carry flights alone. */
  readonly shared?: boolean | undefined;
}
/** How a question ended: with an answer and its cards, or with the reason there is no answer. `cost` is what the budget
 * settled for the question's turns, in millionths of a dollar, on every ending that spent money. `invalid` and `gone`
 * carry no cost, and `spent` carries one only when earlier turns spent money. */
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
  // The system prompt for a loop that has one job, such as a realm's digest. It replaces the concierge's prompt.
  readonly system?: string | undefined;
  // The random source for the tag (node:crypto's by default), the time limit for a tool (30 s by default), and the wait between attempts.
  readonly random?: ((size: number) => Uint8Array) | undefined;
  readonly toolTimeoutMs?: number | undefined;
  readonly wait?: Wait | undefined;
}
// A question while it runs: its words, cards, blocks, trace and conversation, and a count of the model's answers.
export interface Run {
  readonly parts: Parts;
  readonly question: string;
  readonly shared: boolean | undefined;
  readonly kept: Kept;
  readonly blocks: Untrusted;
  readonly trace: Trace;
  readonly messages: Anthropic.MessageParam[];
  // Returns the tool's name if it is one of the loop's tools, and undefined otherwise.
  readonly named: (name: string) => string | undefined;
  // The question's own signal, which fires once its asker has left.
  readonly signal: AbortSignal;
  readonly reads: Reads;
  // What the budget has settled for this question's attempts so far, in nano-dollars.
  readonly paid: { nano: number };
  turns: number;
}

/** The SHA-256 of a list of texts. Each text is prefixed with its length in bytes, so two different lists never give the same hash. */
export function hashParts(parts: readonly string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(`${String(Buffer.byteLength(part))}\0`).update(part);
  return hash.digest("hex");
}

/** Makes the loop for these parts. Its prompt's version is the SHA-256 of its system prompt, skills and tools. */
export function makeLoop(parts: Parts) {
  const system = parts.system ?? systemOf(parts.skills.index);
  // Only the concierge's loop may decline. A one-job loop with its own system prompt may not.
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
    shared: question.shared,
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
// A question must have at least one character that draws something (see isBlank in core), and no more code points than the cap.
// A text with more than twice as many code units as the cap must have more code points than the cap, so the length check
// can return early.
const askable = (text: string, cap: number) =>
  text.length <= 2 * cap && Array.from(text).length <= cap && !isBlank(text);

async function converse(run: Run, prompt: Prompt): Promise<Result> {
  const { parts, trace } = run;
  const attempts = { ...parts, retries: parts.caps.retries, trace, signal: run.signal, paid: run.paid };
  for (;;) {
    // Once the asker has left, callModel makes no request and answers "gone".
    const called = await callModel(attempts, requestOf(parts, prompt, run.messages));
    if (!called.ok) return unanswered(run.paid, called.reason);
    run.turns += 1;
    const over = endOf(run, called.answer);
    if (over !== undefined) return over;
    const results = await resultsOf(run, called.answer.content);
    run.messages.push({ role: "assistant", content: called.answer.content }, { role: "user", content: results });
  }
}

// Returns how the question ends on this answer, along with what it cost, or undefined if it does not end. A decline
// ends the question before the turn cap is checked, and it ignores the turn's other calls and any text.
function endOf(run: Run, answer: Anthropic.Message): Result | undefined {
  const { parts, kept, paid } = run;
  const cost = millionths(paid.nano);
  if (parts.system === undefined && callsDecline(answer.content)) return { kind: "declined", cost };
  const stop = stopOf(answer, run.turns, parts.caps.turns);
  if (stop?.kind === "answer") return { ...stop, cards: kept.cards(), cost, ...keepOf(run.reads) };
  return stop === undefined ? undefined : { ...stop, cost };
}

// The tools and the system prompt come first in the request and are the same bytes on every turn. One cache breakpoint
// on the system prompt caches both. The request's own cache setting also makes the following turns use the cache
// (the claude-api skill, shared/prompt-caching.md).
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
  // Thinking counts toward max_tokens. At low effort the model thinks only a little about a plain question.
  output_config: { effort: "low" },
});
