// A fake model at the SDK's boundary for the loop's tests: answers built from the SDK's own types (Message, its
// content blocks, Usage), given in turn, and every request it was sent kept as a copy.
import type Anthropic from "@anthropic-ai/sdk";
import type { Request, Send } from "../model.ts";

type Usage = Anthropic.Usage;

/** An answer's usage as the API sends it for the global inference at the standard tier and speed. */
export const usage = (tokens: Partial<Usage> = {}): Usage => ({
  input_tokens: 1_000,
  output_tokens: 100,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
  inference_geo: "global",
  output_tokens_details: null,
  server_tool_use: null,
  service_tier: "standard",
  speed: "standard",
  ...tokens,
});

export const text = (words: string): Anthropic.TextBlock => ({ type: "text", text: words, citations: null });

export const toolUse = (id: string, name: string, input: unknown): Anthropic.ToolUseBlock => ({
  type: "tool_use",
  id,
  name,
  input,
  caller: { type: "direct" },
});

export const thinking = (): Anthropic.ThinkingBlock => ({ type: "thinking", thinking: "", signature: "c2lnbmVk" });

interface Shape {
  content: Anthropic.ContentBlock[];
  stop: Anthropic.StopReason | null;
  usage?: Usage;
  model?: string;
  details?: Anthropic.RefusalStopDetails | null;
}

export const message = ({ content, stop, usage: used = usage(), model = "claude-sonnet-5-5", details = null }: Shape) =>
  ({
    id: "msg_fake",
    type: "message",
    role: "assistant",
    model,
    content,
    container: null,
    diagnostics: null,
    stop_reason: stop,
    stop_details: details,
    stop_sequence: null,
    usage: used,
  }) satisfies Anthropic.Message;

/** One step of a fake model: an answer, an error the SDK would throw, or a function of the request and its signal. */
export type Step = Anthropic.Message | Error | ((request: Request, signal?: AbortSignal) => Promise<Anthropic.Message>);

/** A model that takes each step in turn, then fails the test; its requests are kept as JSON copies. */
export const script = (...steps: Step[]) => {
  const requests: Request[] = [];
  const send: Send = async (request, signal) => {
    requests.push(structuredClone(request));
    const step = steps.shift();
    if (step === undefined) throw new Error("the fake model was asked once more than its script");
    if (step instanceof Error) throw step;
    return typeof step === "function" ? step(request, signal) : structuredClone(step);
  };
  return { send, requests };
};
