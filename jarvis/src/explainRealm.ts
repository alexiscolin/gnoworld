// A realm explained from its outline alone, in one request to the fast model with no tool: gno_read's outline (its package doc, exported
// declarations and their doc comments) with the tests, the files that are no source and the unexported block left out, cut to a fixed size,
// inside an untrusted block. The model answers one JSON object; its tags are held to the closed list, and its text is the server's to check.
// A call that is made is charged to the ask budget; nothing is kept here.
import { randomBytes } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import {
  EXPLAIN_CAPS,
  JarvisExplainRequest,
  REALM_EXPLAIN_VERSION,
  RealmExplanation as Answer,
  tagsOf,
} from "@gnoworld/schemas";
import type { Log } from "@gnoworld/service/log";
import type { Tracer } from "@opentelemetry/api";
import type { Budget } from "./budget.ts";
import { millionths } from "./decline.ts";
import { REALM_EXPLAIN_SYSTEM } from "./explainPrompt.ts";
import type { Ran } from "./gnomcp.ts";
import { callModel, type Send, type Wait } from "./model.ts";
import type { Model } from "./prices.ts";
import { traceQuestion } from "./tracing.ts";
import { untrustedBlocks } from "./untrusted.ts";

interface Parts {
  readonly send: Send;
  readonly budget: Budget;
  readonly log: Log;
  readonly tracer: Tracer;
  readonly model: Model;
  readonly retries: number;
  /** gnomcp's gno_read of a package on a profile: its outline. */
  readonly read: (profile: string, path: string, signal: AbortSignal) => Promise<Ran>;
  /** The profile of a chain's id, none for a chain jarvis has no profile for. */
  readonly profileOf: (chain: string) => string | undefined;
  readonly random?: ((size: number) => Uint8Array) | undefined;
  readonly wait?: Wait | undefined;
}

/** What an explanation comes to: the model's answer (its text unchecked, none unless it was sure), or why there is none. */
export type Explained =
  | {
      readonly kind: "explained";
      readonly sure: boolean;
      readonly text: string;
      readonly tags: ReturnType<typeof tagsOf>;
      readonly model: string;
      readonly cost: number;
    }
  | { readonly kind: "failed"; readonly cost: number }
  | { readonly kind: "spent" }
  | { readonly kind: "gone" };

/** The outline's declarations only: each .gno file that is no test, its unexported block removed. Empty when no such file is. */
export function trimOutline(outline: string): string {
  const files = outline.split(/^-- (.+) --$/m);
  const kept: string[] = [];
  // split with a capture group: [before, name, body, name, body, ...]
  for (let at = 1; at + 1 < files.length; at += 2) {
    const name = files[at] ?? "";
    if (!name.endsWith(".gno") || name.endsWith("_test.gno") || name.endsWith("_filetest.gno")) continue;
    const body = (files[at + 1] ?? "").split("\n");
    const cut = body.findIndex((line) => line.startsWith("// unexported:"));
    kept.push(`-- ${name} --\n${(cut === -1 ? body : body.slice(0, cut)).join("\n").trim()}`);
  }
  return kept.join("\n\n");
}

// The answer's text when the model ended its turn, a code fence round it taken off.
function answerOf({ stop_reason: stop, content }: Anthropic.Message): string | undefined {
  if (stop !== "end_turn") return undefined;
  const words = content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
  return /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/.exec(words)?.[1] ?? words;
}

function parsed(words: string | undefined): ReturnType<typeof Answer.parse> | undefined {
  try {
    const answer = Answer.safeParse(JSON.parse(words ?? ""));
    return answer.success ? answer.data : undefined;
  } catch {
    return undefined;
  }
}

// One request to the model with the cut outline, its answer read.
async function label(parts: Parts, outline: string, signal: AbortSignal): Promise<Explained> {
  const blocks = untrustedBlocks({ limit: EXPLAIN_CAPS.outlineBytes, random: parts.random ?? randomBytes });
  const trace = traceQuestion(parts.tracer, { model: parts.model, version: String(REALM_EXPLAIN_VERSION) });
  const paid = { nano: 0 };
  const content = [blocks.rule, blocks.wrap("outline", outline), "Label this realm."];
  const called = await callModel(
    { ...parts, kind: "ask", trace, signal, paid },
    {
      model: parts.model,
      max_tokens: EXPLAIN_CAPS.outputTokens,
      system: [{ type: "text", text: REALM_EXPLAIN_SYSTEM }],
      messages: [{ role: "user", content: content.map((text) => ({ type: "text" as const, text })) }],
      output_config: { effort: "low" },
    },
  );
  const cost = millionths(paid.nano);
  if (!called.ok) {
    trace.end(called.reason, 0);
    if (called.reason === "spent") return { kind: "spent" };
    if (called.reason === "gone") return { kind: "gone" };
    parts.log("jarvis_explain_failed", { reason: "model" });
    return { kind: "failed", cost };
  }
  const answer = parsed(answerOf(called.answer));
  trace.end(answer === undefined ? "failed" : "explained", 1);
  if (answer === undefined) {
    parts.log("jarvis_explain_failed", { reason: "answer" });
    return { kind: "failed", cost };
  }
  const { sure } = answer;
  const [text, tags] = sure ? [answer.text, tagsOf(answer.tags)] : ["", []];
  return { kind: "explained", sure, text, tags, model: called.answer.model, cost };
}

/** The explainer of realms, on jarvis's gnomcp and its fast model. */
export function makeRealmExplainer(parts: Parts) {
  const explain = async (asked: JarvisExplainRequest, signal: AbortSignal): Promise<Explained> => {
    const failed = (reason: "profile" | "read"): Explained => {
      parts.log("jarvis_explain_failed", { reason });
      return { kind: "failed", cost: 0 };
    };
    const profile = parts.profileOf(asked.chain);
    if (profile === undefined) return failed("profile");
    const ran = await parts.read(profile, asked.realm, signal);
    if (signal.aborted) return { kind: "gone" };
    if (!ran.ok || ran.isError) return failed("read");
    const outline = trimOutline(ran.text);
    // No source to read: nothing to say, and nothing to pay for.
    if (outline === "") return { kind: "explained", sure: false, text: "", tags: [], model: parts.model, cost: 0 };
    return label(parts, outline, signal);
  };
  return { explain };
}
