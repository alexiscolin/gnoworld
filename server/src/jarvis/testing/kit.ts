// What the loop's, the model's and gnomcp's tests share: the log's lines as written, a budget on its own in-memory
// file, and a tracer whose finished spans a test reads.
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from "@opentelemetry/sdk-trace";
import { z } from "zod";
import { openDatabase } from "../../db.ts";
import { logger } from "../../log.ts";
import { makeBudget } from "../budget.ts";
import { jarvisMigrations } from "../migrations.ts";

/** The lines a logger writes, each parsed, its time left out. */
export const capture = () => {
  const lines: string[] = [];
  return {
    log: logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line)),
    raw: () => lines.join(""),
    events: () =>
      lines.map((line) =>
        Object.fromEntries(
          Object.entries(z.record(z.string(), z.unknown()).parse(JSON.parse(line))).filter(([key]) => key !== "time"),
        ),
      ),
  };
};

/** A budget on a file of its own in memory, its clock the test's: a cap of `cap` nano-dollars for each kind. */
export const budgetFor = (cap: number, holdMs = 10 * 60_000) => {
  const clock = { now: Date.parse("2026-11-04T12:00:00.000Z") };
  const db = openDatabase(":memory:", jarvisMigrations);
  const budget = makeBudget(db, { caps: { ask: cap, translate: cap }, holdMs, now: () => clock.now });
  return {
    budget,
    clock,
    close: () => {
      db.close();
    },
  };
};

/** A tracer whose spans, once ended, the test reads. */
export const spans = () => {
  const exporter = new InMemorySpanExporter();
  const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] });
  return { tracer: provider.getTracer("jarvis-test"), finished: () => exporter.getFinishedSpans() };
};
