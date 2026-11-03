// What a model call costs (ADR-0002 §5, D41): the three models' prices from the claude-api skill (models cached
// 2026-10-06; shared/prompt-caching.md, "Economics"), in nano-dollars a token so that every price is whole; the cost
// of an answer from its usage, and the most a call can cost, which it reserves before it starts (budget.ts).
import { z } from "zod";

export const MODELS = ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5"] as const;
export type Model = (typeof MODELS)[number];

interface Rates {
  input: number;
  output: number;
  read: number;
  fiveMinutes: number;
  hour: number;
}

// A model's rates for a prompt of that many tokens; Haiku 5.5 alone has a second card, past 100,000 (D61).
function ratesOf(model: Model, prompt: number): Rates {
  switch (model) {
    case "claude-sonnet-5-5":
      return { input: 2_000, output: 10_000, read: 200, fiveMinutes: 2_500, hour: 4_000 };
    case "claude-opus-5-5":
      return { input: 4_000, output: 20_000, read: 200, fiveMinutes: 5_000, hour: 8_000 };
    case "claude-haiku-5-5":
      return prompt > 100_000
        ? { input: 500, output: 2_500, read: 50, fiveMinutes: 625, hour: 1_000 }
        : { input: 100, output: 500, read: 10, fiveMinutes: 125, hour: 200 };
  }
}

// An answer's usage as the API sends it, read only where jarvis can price it: the standard speed, the standard tier
// or the batch one (half the price, so never under the bill), no server tool. Ten million tokens in a field at most.
function usageOf(usage: unknown) {
  const count = z.number().int().min(0).max(10_000_000);
  const optional = count.nullish().transform((tokens) => tokens ?? 0);
  return z
    .object({
      input_tokens: count,
      output_tokens: count,
      cache_read_input_tokens: optional,
      cache_creation_input_tokens: optional,
      cache_creation: z
        .object({ ephemeral_5m_input_tokens: count, ephemeral_1h_input_tokens: count })
        .nullish()
        .transform((split) => split ?? { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 }),
      server_tool_use: z.object({ web_fetch_requests: z.literal(0), web_search_requests: z.literal(0) }).nullish(),
      service_tier: z.enum(["standard", "batch"]).nullish(),
      speed: z.literal("standard").nullish(),
    })
    .safeParse(usage);
}

/** What an answer cost, in nano-dollars, at the rates of the model that served it; undefined when it cannot be priced. */
export function cost(model: string, usage: unknown): number | undefined {
  const parsed = usageOf(usage);
  const priced = MODELS.find((known) => known === model);
  if (!parsed.success || priced === undefined) return undefined;
  const { input_tokens: input, output_tokens: output, cache_read_input_tokens: read } = parsed.data;
  const { ephemeral_5m_input_tokens: fiveMinutes, ephemeral_1h_input_tokens: hour } = parsed.data.cache_creation;
  // A write the split does not explain is priced at the hour's rate, the dearer.
  const unsplit = Math.max(0, parsed.data.cache_creation_input_tokens - fiveMinutes - hour);
  const rates = ratesOf(priced, input + read + fiveMinutes + hour + unsplit);
  const written = fiveMinutes * rates.fiveMinutes + (hour + unsplit) * rates.hour;
  return input * rates.input + output * rates.output + read * rates.read + written;
}

/** The most a call can cost with its retries, each attempt billed, in nano-dollars: a RangeError on a wrong bound. */
export function worstCost(
  model: Model,
  { inputBytes, maxTokens, attempts }: { inputBytes: number; maxTokens: number; attempts: number },
): number {
  if (!Number.isSafeInteger(inputBytes) || inputBytes < 0) throw new RangeError("inputBytes: a count of bytes");
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1) throw new RangeError("maxTokens: a count of tokens, from 1");
  if (![1, 2, 3].includes(attempts)) throw new RangeError("attempts: one, and two retries at most");
  // No prompt has more tokens than its UTF-8 bytes: each byte is the dearest input token of the card they can reach.
  const rates = ratesOf(model, inputBytes);
  const dearest = Math.max(rates.input, rates.read, rates.fiveMinutes, rates.hour);
  return attempts * (inputBytes * dearest + maxTokens * rates.output);
}
