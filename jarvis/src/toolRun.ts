// A turn's tool calls (loop.ts): each checked, run within its time and its asker's stay, its result cut and wrapped.
import type Anthropic from "@anthropic-ai/sdk";
import type { Allowlist, Definition } from "./allowlist.ts";
import { failure, refusal, type Refusal } from "./callWords.ts";
import type { Ran } from "./gnomcp.ts";
import type { Run } from "./loop.ts";
import { noteRead } from "./loopParts.ts";
import type { Asked } from "./tools/kept.ts";
import type { Trace } from "./tracing.ts";
import type { Untrusted } from "./untrusted.ts";

type Allowed = Extract<ReturnType<Allowlist<Definition>["check"]>, { ok: true }>;
/** A tool call's time, unless the loop's parts set another. */
export const TOOL_MS = 30_000;
// A call run with its question's words and cards, seen through the call's own time.
export type Runs = (call: Allowed, asked: Asked) => Promise<Ran>;

// ponytail: a turn's calls run at once, eight at most, each bounded by its time; the model writes at most what
// max_tokens holds.
export async function resultsOf(
  run: Run,
  content: Anthropic.ContentBlock[],
): Promise<Anthropic.ToolResultBlockParam[]> {
  const uses = content.filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  return Promise.all(
    uses.map((use, at) => (at < 8 ? resultOf(run, use) : Promise.resolve(refused(run, use, "too_many_calls")))),
  );
}

async function resultOf(run: Run, use: Anthropic.ToolUseBlock): Promise<Anthropic.ToolResultBlockParam> {
  const { parts, blocks, trace } = run;
  // The tag's check first, so a call that holds it is logged once, refused, and never as a call the allowlist passed.
  if (holdsTag(blocks, JSON.stringify(use.input ?? null))) return refused(run, use, "holds_tag");
  const call = parts.tools.allowlist.check(use.name, use.input);
  if (!call.ok) return refused(run, use, call.reason);
  const ran = noteRead(run.reads, call, await ranWithin(run, call, trace.tool(call.name)));
  if (!ran.ok) return { type: "tool_result", tool_use_id: use.id, is_error: true, content: failure(ran.reason) };
  return { type: "tool_result", tool_use_id: use.id, is_error: ran.isError, content: blocks.wrap(call.name, ran.text) };
}

// holds() counts a shown code point as nothing, so the tag written as code points ([U+abab]...) is read with their
// digits kept too. A heuristic: a tag written another way reaches a tool, and comes back replaced or withheld (D80).
const holdsTag = (blocks: Untrusted, text: string) =>
  blocks.holds(text) || blocks.holds(text.replace(/\[U\+([0-9A-F]{4,6})\]/giu, "$1"));

// A refused call is answered as refused and never run; the allowlist logged its own refusals already.
function refused(run: Run, use: Anthropic.ToolUseBlock, reason: Refusal): Anthropic.ToolResultBlockParam {
  const name = run.named(use.name);
  if (reason === "holds_tag" || reason === "too_many_calls")
    run.parts.log("jarvis_tool_refused", { tool: name ?? "<unknown>", reason });
  run.trace.refused(name, reason);
  return { type: "tool_result", tool_use_id: use.id, is_error: true, content: refusal(reason) };
}

// A run within the tool's time and its asker's stay, its span ended however it ends; one past either goes on, ended
// by its own timeout, its signal aborted, so the question's cards keep nothing it hands in after.
async function ranWithin(run: Run, call: Allowed, span: ReturnType<Trace["tool"]>): Promise<Ran> {
  const time = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stop = (): void => undefined;
  const late = new Promise<Ran>((resolve) => {
    stop = () => {
      time.abort();
      resolve({ ok: false, reason: "timeout" });
    };
    timer = setTimeout(stop, run.parts.toolTimeoutMs ?? TOOL_MS);
    run.signal.addEventListener("abort", stop);
    // A signal fired before it listened fires no more.
    if (run.signal.aborted) stop();
  });
  const asked: Asked = { text: run.question, cards: run.kept.within(time.signal), signal: time.signal };
  let ran: Ran = { ok: false, reason: "error" };
  try {
    ran = await Promise.race([run.parts.tools.run(call, asked), late]);
    return ran;
  } finally {
    clearTimeout(timer);
    run.signal.removeEventListener("abort", stop);
    if (ran.ok) span.done(ran.isError);
    else span.failed(ran.reason);
  }
}
