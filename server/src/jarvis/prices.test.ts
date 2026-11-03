import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cost, MODELS, worstCost, type Model } from "./prices.ts";

// The claude-api skill's table (models cached 2026-10-06) and shared/prompt-caching.md's "Economics", in dollars a
// million tokens: a token's price in nano-dollars is that figure times 1,000.
const nano = (dollarsPerMillion: number): number => Math.round(dollarsPerMillion * 1000);
const usage = (fields: Record<string, unknown>) => ({
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: null,
  cache_creation_input_tokens: null,
  cache_creation: null,
  ...fields,
});
const split = (fiveMinutes: number, hour: number) => ({
  ephemeral_5m_input_tokens: fiveMinutes,
  ephemeral_1h_input_tokens: hour,
});
const MILLION = 1_000_000;

describe("the models", () => {
  it("are the three the settings may name, each priced", () => {
    expect([...MODELS].sort()).toEqual(["claude-haiku-5-5", "claude-opus-5-5", "claude-sonnet-5-5"]);
  });
});

describe("cost", () => {
  it("prices Sonnet 5.5: $2 in, $10 out, $0.20 a cache read, $2.50 a 5-minute write, $4 an hour's", () => {
    const model = "claude-sonnet-5-5";
    expect(cost(model, usage({ input_tokens: MILLION }))).toBe(MILLION * nano(2));
    expect(cost(model, usage({ output_tokens: MILLION }))).toBe(MILLION * nano(10));
    expect(cost(model, usage({ cache_read_input_tokens: MILLION }))).toBe(MILLION * nano(0.2));
    const fiveMinutes = { cache_creation_input_tokens: MILLION, cache_creation: split(MILLION, 0) };
    expect(cost(model, usage(fiveMinutes))).toBe(MILLION * nano(2 * 1.25));
    const hour = { cache_creation_input_tokens: MILLION, cache_creation: split(0, MILLION) };
    expect(cost(model, usage(hour))).toBe(MILLION * nano(2 * 2));
  });

  it("prices Opus 5.5: $4 in, $20 out, $0.20 a cache read (0.05 of the input), $5 and $8 a write", () => {
    const model = "claude-opus-5-5";
    expect(cost(model, usage({ input_tokens: MILLION }))).toBe(MILLION * nano(4));
    expect(cost(model, usage({ output_tokens: MILLION }))).toBe(MILLION * nano(20));
    expect(cost(model, usage({ cache_read_input_tokens: MILLION }))).toBe(MILLION * nano(0.2));
    const fiveMinutes = { cache_creation_input_tokens: MILLION, cache_creation: split(MILLION, 0) };
    expect(cost(model, usage(fiveMinutes))).toBe(MILLION * nano(4 * 1.25));
    const hour = { cache_creation_input_tokens: MILLION, cache_creation: split(0, MILLION) };
    expect(cost(model, usage(hour))).toBe(MILLION * nano(4 * 2));
  });

  it("prices Haiku 5.5 up to a 100K-token prompt: $0.10 in, $0.50 out, reads 0.1, writes 1.25 and 2 of the input", () => {
    const model = "claude-haiku-5-5";
    const tokens = 100_000;
    expect(cost(model, usage({ input_tokens: tokens }))).toBe(tokens * nano(0.1));
    expect(cost(model, usage({ output_tokens: MILLION }))).toBe(MILLION * nano(0.5));
    expect(cost(model, usage({ cache_read_input_tokens: tokens }))).toBe(tokens * nano(0.1 * 0.1));
    const fiveMinutes = { cache_creation_input_tokens: tokens, cache_creation: split(tokens, 0) };
    expect(cost(model, usage(fiveMinutes))).toBe(tokens * nano(0.1 * 1.25));
    const hour = { cache_creation_input_tokens: tokens, cache_creation: split(0, tokens) };
    expect(cost(model, usage(hour))).toBe(tokens * nano(0.1 * 2));
  });

  it("prices Haiku 5.5 above a 100K-token prompt at its other card: $0.50 in, $2.50 out, and their reads and writes", () => {
    const model = "claude-haiku-5-5";
    expect(cost(model, usage({ input_tokens: MILLION }))).toBe(MILLION * nano(0.5));
    expect(cost(model, usage({ input_tokens: 100_001, output_tokens: MILLION }))).toBe(
      100_001 * nano(0.5) + MILLION * nano(2.5),
    );
    expect(cost(model, usage({ cache_read_input_tokens: MILLION }))).toBe(MILLION * nano(0.5 * 0.1));
    const fiveMinutes = { cache_creation_input_tokens: MILLION, cache_creation: split(MILLION, 0) };
    expect(cost(model, usage(fiveMinutes))).toBe(MILLION * nano(0.5 * 1.25));
    const hour = { cache_creation_input_tokens: MILLION, cache_creation: split(0, MILLION) };
    expect(cost(model, usage(hour))).toBe(MILLION * nano(0.5 * 2));
  });

  it("chooses Haiku 5.5's card by the whole prompt, cache reads and writes included, at 100,000 tokens and one more", () => {
    const model = "claude-haiku-5-5";
    // 60,000 + 40,000 = 100,000 tokens: the first card, output included.
    const at = usage({ input_tokens: 60_000, cache_read_input_tokens: 40_000, output_tokens: 1_000 });
    expect(cost(model, at)).toBe(60_000 * nano(0.1) + 40_000 * nano(0.01) + 1_000 * nano(0.5));
    // One token more, an hour's write: every part at the other card.
    const past = { ...at, cache_creation_input_tokens: 1, cache_creation: split(0, 1) };
    expect(cost(model, past)).toBe(60_000 * nano(0.5) + 40_000 * nano(0.05) + 1 * nano(1) + 1_000 * nano(2.5));
    // The output is no part of the prompt.
    expect(cost(model, usage({ input_tokens: 100_000, output_tokens: 50_000 }))).toBe(
      100_000 * nano(0.1) + 50_000 * nano(0.5),
    );
  });

  it("costs the plan's question: 20K tokens in, 18K of them read from the cache, and 1K out on Sonnet 5.5, $0.0176", () => {
    const question = usage({ input_tokens: 2_000, cache_read_input_tokens: 18_000, output_tokens: 1_000 });
    expect(cost("claude-sonnet-5-5", question)).toBe(17_600_000);
    expect(cost("claude-sonnet-5-5", question)).toBe(2_000 * nano(2) + 18_000 * nano(0.2) + 1_000 * nano(10));
  });

  it("adds every part of an answer's usage", () => {
    const answer = usage({
      input_tokens: 1_000,
      output_tokens: 500,
      cache_read_input_tokens: 18_000,
      cache_creation_input_tokens: 2_000,
      cache_creation: split(1_500, 500),
    });
    expect(cost("claude-sonnet-5-5", answer)).toBe(
      1_000 * nano(2) + 500 * nano(10) + 18_000 * nano(0.2) + 1_500 * nano(2.5) + 500 * nano(4),
    );
  });

  it("reads a null or missing field as 0", () => {
    expect(cost("claude-sonnet-5-5", usage({ input_tokens: 10, output_tokens: 10 }))).toBe(
      10 * nano(2) + 10 * nano(10),
    );
    expect(cost("claude-sonnet-5-5", { input_tokens: 10, output_tokens: 10 })).toBe(10 * nano(2) + 10 * nano(10));
  });

  it("prices a cache write whose TTL is not given at the hour's rate, the worse", () => {
    expect(cost("claude-sonnet-5-5", usage({ cache_creation_input_tokens: 1_000 }))).toBe(1_000 * nano(4));
    // A split that names fewer tokens than the total: the rest at the hour's rate.
    const short = usage({ cache_creation_input_tokens: 1_000, cache_creation: split(300, 200) });
    expect(cost("claude-sonnet-5-5", short)).toBe(300 * nano(2.5) + 200 * nano(4) + 500 * nano(4));
    // A split that names more: the split counts.
    const long = usage({ cache_creation_input_tokens: 100, cache_creation: split(300, 0) });
    expect(cost("claude-sonnet-5-5", long)).toBe(300 * nano(2.5));
  });

  it("counts a split's tokens in the prompt that chooses Haiku 5.5's card", () => {
    const write = usage({ input_tokens: 99_000, cache_creation_input_tokens: 100, cache_creation: split(1_001, 0) });
    expect(cost("claude-haiku-5-5", write)).toBe(99_000 * nano(0.5) + 1_001 * nano(0.625));
  });

  it("counts the write no split explains in the prompt that chooses Haiku 5.5's card (red pass F5)", () => {
    const write = usage({ input_tokens: 99_999, cache_creation_input_tokens: 2 });
    expect(cost("claude-haiku-5-5", write)).toBe(99_999 * nano(0.5) + 2 * nano(1));
  });

  it("prices an answer's usage as the SDK types it, its other fields at the standard tier and speed (red pass F6)", () => {
    const answer = {
      input_tokens: 2_000,
      output_tokens: 1_000,
      cache_read_input_tokens: 18_000,
      cache_creation_input_tokens: 0,
      cache_creation: split(0, 0),
      inference_geo: "us",
      output_tokens_details: { thinking_tokens: 400 },
      server_tool_use: { web_fetch_requests: 0, web_search_requests: 0 },
      service_tier: "standard",
      speed: "standard",
    };
    const standard = 2_000 * nano(2) + 18_000 * nano(0.2) + 1_000 * nano(10);
    expect(cost("claude-sonnet-5-5", answer)).toBe(standard);
    expect(cost("claude-sonnet-5-5", { ...answer, server_tool_use: null, service_tier: null, speed: null })).toBe(
      standard,
    );
    // The batch tier costs half: priced at the standard one, the cost is never below the bill.
    expect(cost("claude-sonnet-5-5", { ...answer, service_tier: "batch" })).toBe(standard);
  });

  it.each([
    ["a model it holds no price for", "claude-fable-5-1", {}],
    ["no model", "", {}],
    ["the priority tier", "claude-sonnet-5-5", { service_tier: "priority" }],
    ["fast mode", "claude-opus-5-5", { speed: "fast" }],
    ["a web search", "claude-sonnet-5-5", { server_tool_use: { web_fetch_requests: 0, web_search_requests: 1 } }],
    ["a web fetch", "claude-sonnet-5-5", { server_tool_use: { web_fetch_requests: 1, web_search_requests: 0 } }],
  ])("prices nothing for %s, which jarvis never asks: the call is charged at its worst", (_, model, fields) => {
    expect(cost(model, usage({ input_tokens: 10, output_tokens: 10, ...fields }))).toBeUndefined();
  });

  it.each([
    ["a negative count", { input_tokens: -1, output_tokens: 0 }],
    ["a fraction", { input_tokens: 1.5, output_tokens: 0 }],
    ["not a number", { input_tokens: Number.NaN, output_tokens: 0 }],
    ["an infinite count", { input_tokens: 0, output_tokens: Number.POSITIVE_INFINITY }],
    ["a count as text", { input_tokens: "10", output_tokens: 0 }],
    ["no input count", { output_tokens: 0 }],
    ["no output count", { input_tokens: 0 }],
    ["a cache read below 0", { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: -5 }],
    ["a split below 0", { input_tokens: 0, output_tokens: 0, cache_creation: split(-1, 0) }],
    ["input past ten million", { input_tokens: 10_000_001, output_tokens: 0 }],
    ["output past ten million", { input_tokens: 0, output_tokens: 10_000_001 }],
    ["cache reads past ten million", { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 10_000_001 }],
    ["a cache write past ten million", { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 10_000_001 }],
    ["a 5-minute write past ten million", { input_tokens: 0, output_tokens: 0, cache_creation: split(10_000_001, 0) }],
    ["an hour's write past ten million", { input_tokens: 0, output_tokens: 0, cache_creation: split(0, 10_000_001) }],
    ["no usage at all", undefined],
  ])("prices nothing from a usage with %s: no cost is made up from it", (_, given) => {
    expect(cost("claude-sonnet-5-5", given)).toBeUndefined();
  });

  it("takes a count of ten million in every field, the most", () => {
    const most = usage({
      input_tokens: 10_000_000,
      output_tokens: 10_000_000,
      cache_read_input_tokens: 10_000_000,
      cache_creation_input_tokens: 10_000_000,
      cache_creation: split(10_000_000, 10_000_000),
    });
    expect(cost("claude-opus-5-5", most)).toBe(10_000_000 * (nano(4) + nano(20) + nano(0.2) + nano(5) + nano(8)));
  });
});

describe("worstCost", () => {
  it("prices every input byte as an hour's cache write and every allowed output token", () => {
    expect(worstCost("claude-sonnet-5-5", { inputBytes: 1_000, maxTokens: 100, attempts: 1 })).toBe(
      1_000 * nano(4) + 100 * nano(10),
    );
    expect(worstCost("claude-opus-5-5", { inputBytes: 1_000, maxTokens: 10, attempts: 1 })).toBe(
      1_000 * nano(8) + 10 * nano(20),
    );
  });

  it("prices Haiku 5.5 at its other card once the bytes can pass 100K tokens", () => {
    expect(worstCost("claude-haiku-5-5", { inputBytes: 100_000, maxTokens: 1_000, attempts: 1 })).toBe(
      100_000 * nano(0.2) + 1_000 * nano(0.5),
    );
    expect(worstCost("claude-haiku-5-5", { inputBytes: 100_001, maxTokens: 1_000, attempts: 1 })).toBe(
      100_001 * nano(1) + 1_000 * nano(2.5),
    );
  });

  it("bounds a call with its retries: each attempt may be billed (red pass, its third design note)", () => {
    const once = 1_000 * nano(4) + 100 * nano(10);
    expect(worstCost("claude-sonnet-5-5", { inputBytes: 1_000, maxTokens: 100, attempts: 2 })).toBe(2 * once);
    expect(worstCost("claude-sonnet-5-5", { inputBytes: 1_000, maxTokens: 100, attempts: 3 })).toBe(3 * once);
  });

  it("takes no input byte and one output token, the least", () => {
    expect(worstCost("claude-sonnet-5-5", { inputBytes: 0, maxTokens: 1, attempts: 1 })).toBe(nano(10));
  });

  it.each([
    ["negative bytes", { inputBytes: -1, maxTokens: 10 }, "inputBytes: a count of bytes"],
    ["a fraction of a byte", { inputBytes: 1.5, maxTokens: 10 }, "inputBytes: a count of bytes"],
    ["bytes that are not a number", { inputBytes: Number.NaN, maxTokens: 10 }, "inputBytes: a count of bytes"],
    ["no output token", { inputBytes: 10, maxTokens: 0 }, "maxTokens: a count of tokens, from 1"],
    ["a fraction of a token", { inputBytes: 10, maxTokens: 0.5 }, "maxTokens: a count of tokens, from 1"],
    [
      "infinite tokens",
      { inputBytes: 10, maxTokens: Number.POSITIVE_INFINITY },
      "maxTokens: a count of tokens, from 1",
    ],
  ])("refuses %s, naming the bound: a bound must be a count", (_, bounds, message) => {
    expect(() => worstCost("claude-sonnet-5-5", { ...bounds, attempts: 1 })).toThrow(new RangeError(message));
  });

  it.each([0, 4, 1.5, Number.NaN])("refuses %d attempts: one, and two retries at most (ADR-0002 §5)", (attempts) => {
    expect(() => worstCost("claude-sonnet-5-5", { inputBytes: 10, maxTokens: 10, attempts })).toThrow(
      new RangeError("attempts: one, and two retries at most"),
    );
  });

  it("is never below the cost of an answer within its bounds, on every model", () => {
    const counts = fc.integer({ min: 0, max: 300_000 });
    fc.assert(
      fc.property(
        fc.constantFrom<Model>(...MODELS),
        fc.record({ input: counts, read: counts, fiveMinutes: counts, hour: counts, unsplit: counts }),
        fc.record({
          maxTokens: fc.integer({ min: 1, max: 128_000 }),
          spare: fc.integer({ min: 0, max: 50_000 }),
          output: fc.integer({ min: 0, max: 128_000 }),
        }),
        (model, tokens, { maxTokens, spare, output }) => {
          const created = tokens.fiveMinutes + tokens.hour + tokens.unsplit;
          const prompt = tokens.input + tokens.read + created;
          const answer = usage({
            input_tokens: tokens.input,
            cache_read_input_tokens: tokens.read,
            cache_creation_input_tokens: created,
            cache_creation: split(tokens.fiveMinutes, tokens.hour),
            output_tokens: Math.min(output, maxTokens),
          });
          // No prompt has more tokens than its UTF-8 bytes; an answer priced at nothing fails the property.
          const priced = cost(model, answer) ?? Number.POSITIVE_INFINITY;
          expect(worstCost(model, { inputBytes: prompt + spare, maxTokens, attempts: 1 })).toBeGreaterThanOrEqual(
            priced,
          );
        },
      ),
    );
  });
});
