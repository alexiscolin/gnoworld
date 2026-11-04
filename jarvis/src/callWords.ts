// What the model reads of a tool call the loop refused, or whose run gave nothing: the loop's own words, never a
// tool's, so no tool's failure writes into the conversation.
import type { Ran } from "./gnomcp.ts";

/** Why the loop refused a call before it ran. */
export type Refusal = "unknown_tool" | "bad_arguments" | "holds_tag" | "too_many_calls";

/** The words of a refused call. */
export function refusal(reason: Refusal): string {
  const words: Record<Refusal, string> = {
    unknown_tool: "Refused: no tool of that name is yours.",
    bad_arguments: "Refused: its arguments do not match the tool's schema.",
    holds_tag: "Refused: its input holds the turn's tag.",
    too_many_calls: "Refused: a turn takes eight calls at most.",
  };
  return words[reason];
}

/** The words of a run that gave nothing. */
export function failure(reason: Extract<Ran, { ok: false }>["reason"]): string {
  const words: Record<typeof reason, string> = {
    timeout: "The tool did not answer in time.",
    down: "The tool is not running.",
    malformed: "The tool's answer could not be read.",
    error: "The tool failed.",
    refused: "The tool refused the call.",
  };
  return words[reason];
}
