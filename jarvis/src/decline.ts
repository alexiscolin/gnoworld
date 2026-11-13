// The tool a question off Jarvis's ground ends on (D13985), and a question's cost in the unit the door counts.
import type Anthropic from "@anthropic-ai/sdk";

/** `decline`, no arguments: offered to the concierge's loop beside its allowlist's tools. */
export const DECLINE = {
  name: "decline",
  description:
    "Call this, with no arguments, for a question about anything but gno.land, gnoworld, the place it is asked from or the room's talk. Write no text with it.",
  input_schema: { type: "object" as const, properties: {} },
};

/** Whether an answer's content calls `decline` as it is offered: with an empty input, any other being a refused call. */
export const callsDecline = (content: Anthropic.ContentBlock[]): boolean =>
  content.some(
    (block) =>
      block.type === "tool_use" &&
      block.name === DECLINE.name &&
      typeof block.input === "object" &&
      block.input !== null &&
      Object.keys(block.input).length === 0,
  );

/** Millionths of a dollar for nano-dollars, rounded up so a small question never costs nothing. */
export const millionths = (nano: number): number => Math.ceil(nano / 1_000);
