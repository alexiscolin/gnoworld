// The loop with the tools a test gives, for the tools' own tests: a fake model taking its steps in turn, a $45 day, 10e's
// caps, the tag of 16 bytes of 0xab, and the tools' table as the allowlist offers it.
import { allowlist, type Definition } from "../allowlist.ts";
import type { Ran } from "../gnomcp.ts";
import { makeLoop } from "../loop.ts";
import type { Asked } from "../tools/kept.ts";
import { script, type Step } from "./fakeModel.ts";
import { budgetFor, capture, spans } from "./kit.ts";

interface With {
  readonly steps: Step[];
  readonly definitions: readonly Definition[];
  readonly run: (call: { name: string; args: unknown }, asked: Asked) => Promise<Ran>;
}

export const TAG = "ab".repeat(16);

export function loopWith({ steps, definitions, run }: With) {
  const { budget, close } = budgetFor(45 * 1_000_000_000);
  const { log, events } = capture();
  const model = script(...steps);
  const table = allowlist(definitions, log);
  const caps = {
    questionChars: 2_000,
    turns: 8,
    outputTokens: 4_096,
    callTimeoutMs: 60_000,
    retries: 2,
    toolResultBytes: 16 * 1024,
  };
  const loop = makeLoop({
    send: model.send,
    budget,
    log,
    tracer: spans().tracer,
    model: "claude-sonnet-5-5",
    caps,
    skills: { index: [], digest: "d".repeat(64) },
    tools: { allowlist: table, run },
    random: (size) => new Uint8Array(size).fill(0xab),
    wait: () => Promise.resolve(),
  });
  return { loop, model, table, events, close };
}
