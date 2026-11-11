import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { callsDecline } from "./decline.ts";

// A content block as the SDK's types would not build it by hand: the tests give the shapes the model could send.
const blocks = (...some: unknown[]) => some as Anthropic.ContentBlock[];
const use = (input: unknown, over: Record<string, unknown> = {}) => ({
  type: "tool_use",
  id: "toolu_d",
  name: "decline",
  input,
  ...over,
});

describe("callsDecline", () => {
  it("is true for a `decline` tool use with an empty input, among other blocks", () => {
    expect(callsDecline(blocks({ type: "text", text: "no" }, use({})))).toBe(true);
  });

  it.each([
    ["an input with a field", use({ why: "x" })],
    ["another tool's name", use({}, { name: "gno_status" })],
    ["a block that is no tool use but holds the name and an empty input", use({}, { type: "server_tool_use" })],
    ["an input that is a string, which has no keys", use("")],
    ["an input that is null", use(null)],
    ["an input that is a number", use(0)],
  ])("is false for %s", (_case, block) => {
    expect(callsDecline(blocks(block))).toBe(false);
  });
});
