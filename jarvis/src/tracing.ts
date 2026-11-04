// Jarvis's traces (ADR-0002 §5, "Observability"): one trace per question, a span per model request and per tool call
// under it, refusals and the budget's alerts as its events, counts and fixed words only, never a question's text, an
// argument, a result or an account. Spans leave over OTLP/HTTP to the collector JARVIS_TRACES_URL names, nowhere by
// default (D85). sdk-trace has no async context manager, so each span is handed its parent (Alexis, 2026-11-04).
import type Anthropic from "@anthropic-ai/sdk";
import { ROOT_CONTEXT, SpanStatusCode, trace, type Span, type Tracer } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { BatchSpanProcessor, TracerProvider } from "@opentelemetry/sdk-trace";
import { z } from "zod";
import { parseSettings } from "../../server/src/settings.ts";
import { isName } from "./allowlist.ts";

/** jarvis's tracer, its spans exported to JARVIS_TRACES_URL when set; throws naming the setting when it is no URL.
 * shutdown() tells whether the last spans left: a collector out of reach costs spans, never jarvis's stop. */
export function startTracing(env: Record<string, string | undefined>) {
  const Env = z.object({ JARVIS_TRACES_URL: z.url({ protocol: /^https?$/ }).optional() });
  const { JARVIS_TRACES_URL: url } = parseSettings(Env, env);
  const exporting =
    url === undefined
      ? []
      : [new BatchSpanProcessor({ exporter: new OTLPTraceExporter({ url, timeoutMillis: 5_000 }) })];
  const provider = new TracerProvider({ spanProcessors: exporting });
  const shutdown = (): Promise<boolean> =>
    provider.shutdown().then(
      () => true,
      () => false,
    );
  return { tracer: provider.getTracer("jarvis"), shutdown };
}

/** A name the model or a child wrote, as a log line or a span may hold it: itself when it is a name, else a fixed word. */
export const shown = (name: string): string => (isName(name) ? name : "<malformed>");

export interface Trace {
  request(attempt: number): {
    answered(answer: Anthropic.Message, charged: number | undefined): void;
    failed(error: string, charged: number | undefined): void;
  };
  tool(name: string): { done(isError: boolean): void; failed(reason: string): void };
  // A tool's name, or none when the model made it up: such a name may carry a question's words.
  refused(tool: string | undefined, reason: string): void;
  alert(level: number): void;
  end(result: string, turns: number): void;
}

// What a model request's span says of its answer: the served model, the tokens (cache reads and writes counted in
// the input, as OpenTelemetry's GenAI attributes count them) and why it stopped.
const usageOf = ({ model, usage, stop_reason: stop }: Anthropic.Message) => {
  const read = usage.cache_read_input_tokens ?? 0;
  const written = usage.cache_creation_input_tokens ?? 0;
  return {
    "gen_ai.response.model": model,
    "gen_ai.usage.input_tokens": usage.input_tokens + read + written,
    "gen_ai.usage.output_tokens": usage.output_tokens,
    "gen_ai.usage.cache_read.input_tokens": read,
    "gen_ai.usage.cache_write.input_tokens": written,
    "gen_ai.response.finish_reasons": [stop ?? "none"],
  };
};

const ended = (span: Span, error?: string) => {
  if (error === undefined) span.setStatus({ code: SpanStatusCode.OK });
  else span.setAttribute("error.type", error).setStatus({ code: SpanStatusCode.ERROR });
  span.end();
};

/** A question's trace: its span now, the others under it as the loop makes them. */
export function traceQuestion(tracer: Tracer, { model, version }: { model: string; version: string }): Trace {
  const named = { "gen_ai.request.model": model, "jarvis.prompt_version": version };
  const question = tracer.startSpan("jarvis.question", { attributes: named });
  const under = trace.setSpan(ROOT_CONTEXT, question);
  let spent = 0;
  const charge = (span: Span, charged: number | undefined) => {
    if (charged === undefined) return;
    span.setAttribute("jarvis.cost_nano_usd", charged);
    spent += charged;
  };
  return {
    request(attempt) {
      const span = tracer.startSpan(
        "jarvis.model_request",
        { attributes: { ...named, "jarvis.attempt": attempt } },
        under,
      );
      return {
        answered(answer, charged) {
          span.setAttributes(usageOf(answer));
          charge(span, charged);
          ended(span);
        },
        failed(error, charged) {
          charge(span, charged);
          ended(span, error);
        },
      };
    },
    tool(name) {
      const span = tracer.startSpan("jarvis.tool_call", { attributes: { "gen_ai.tool.name": name } }, under);
      return {
        done: (isError) => {
          ended(span, isError ? "tool_error" : undefined);
        },
        failed: (reason) => {
          ended(span, reason);
        },
      };
    },
    refused(tool, reason) {
      const name = tool === undefined ? "<unknown>" : shown(tool);
      question.addEvent("jarvis.tool_refused", { "gen_ai.tool.name": name, "jarvis.reason": reason });
    },
    alert(level) {
      question.addEvent("jarvis.budget_alert", { "jarvis.level": level });
    },
    end(result, turns) {
      question.setAttributes({ "jarvis.result": result, "jarvis.turns": turns, "jarvis.cost_nano_usd": spent });
      question.end();
    },
  };
}
