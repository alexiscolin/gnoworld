// What jarvis's spans say of a case (jarvis/src/tracing.ts): the tools it ran, those it refused, how many questions it
// made (one `jarvis.question` a making), its cost and its prompt's version, read from the OTLP/HTTP JSON batches its
// exporter sends (@opentelemetry/exporter-trace-otlp-http 0.223.0, JsonTraceSerializer).
import { z } from "zod";

const Value = z.object({
  stringValue: z.string().optional(),
  intValue: z.union([z.string(), z.number()]).optional(),
  doubleValue: z.number().optional(),
});
const Attribute = z.object({ key: z.string(), value: Value });
const Span = z.object({
  name: z.string(),
  attributes: z.array(Attribute).default([]),
  events: z.array(z.object({ name: z.string(), attributes: z.array(Attribute).default([]) })).default([]),
});
const Batch = z.object({
  resourceSpans: z.array(z.object({ scopeSpans: z.array(z.object({ spans: z.array(Span) })) })),
});

export interface Outcome {
  tools: string[];
  refused: string[];
  made: number;
  nanoUsd: number;
  versions: string[];
}

const valueOf = (attributes: z.infer<typeof Attribute>[], key: string): string | number | undefined => {
  const value = attributes.find((attribute) => attribute.key === key)?.value;
  if (value === undefined) return undefined;
  return value.stringValue ?? (value.intValue === undefined ? value.doubleValue : Number(value.intValue));
};

/** The outcome of every span of these batches; a batch that is no OTLP JSON throws. */
export function outcomeOf(batches: readonly unknown[]): Outcome {
  const spans = batches.flatMap((batch) =>
    Batch.parse(batch).resourceSpans.flatMap((resource) => resource.scopeSpans.flatMap((scope) => scope.spans)),
  );
  const questions = spans.filter((span) => span.name === "jarvis.question");
  const named = (attributes: z.infer<typeof Attribute>[]) => String(valueOf(attributes, "gen_ai.tool.name") ?? "?");
  return {
    tools: spans.filter((span) => span.name === "jarvis.tool_call").map((span) => named(span.attributes)),
    refused: questions.flatMap((span) =>
      span.events.filter((event) => event.name === "jarvis.tool_refused").map((event) => named(event.attributes)),
    ),
    made: questions.length,
    nanoUsd: questions.reduce((sum, span) => sum + Number(valueOf(span.attributes, "jarvis.cost_nano_usd") ?? 0), 0),
    versions: [...new Set(questions.map((span) => String(valueOf(span.attributes, "jarvis.prompt_version") ?? "?")))],
  };
}
