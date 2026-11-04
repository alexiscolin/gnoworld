// The evals' own code, on Node's test runner (run.sh runs it before any case spends a cent; setup-10j.sh once): the
// cases read by their schema, the spans read for their tools and cost, each expectation an assertion that passes and
// fails when it should, and the cache's key moved by any setting.
import assert from "node:assert/strict";
import { test } from "node:test";
import { expanded, readCases } from "./cases.ts";
import { fingerprint } from "./fingerprint.ts";
import { outcomeOf } from "./spans.ts";
import { assertionsOf } from "./tests.ts";

const ROOT = new URL("../", import.meta.url).pathname;

test("every case reads by its schema, ids unique, the hidden characters written as code points", () => {
  const cases = readCases(new URL("cases", import.meta.url).pathname);
  assert.ok(cases.length >= 40);
  assert.equal(new Set(cases.map((one) => one.id)).size, cases.length);
  const bidi = cases.find((one) => one.id === "bidi-mark-dropped");
  assert.ok(bidi !== undefined && "translate" in bidi);
  assert.ok(bidi.translate.text.includes(String.fromCodePoint(0x202e)));
  assert.equal(expanded("a<U+202C>b<U+110000>"), `a${String.fromCodePoint(0x202c)}b<U+110000>`);
});

test("the spans give the tools run, those refused, the makings, the cost and the version", () => {
  const attribute = (key: string, value: string | number) => ({
    key,
    value: typeof value === "string" ? { stringValue: value } : { intValue: String(value) },
  });
  const batch = {
    resourceSpans: [
      {
        scopeSpans: [
          {
            spans: [
              { name: "jarvis.tool_call", attributes: [attribute("gen_ai.tool.name", "gno_status")] },
              {
                name: "jarvis.question",
                attributes: [attribute("jarvis.cost_nano_usd", 15_800_000), attribute("jarvis.prompt_version", "v1")],
                events: [{ name: "jarvis.tool_refused", attributes: [attribute("gen_ai.tool.name", "gno_call")] }],
              },
              { name: "jarvis.model_request", attributes: [attribute("jarvis.attempt", 1)] },
            ],
          },
        ],
      },
    ],
  };
  assert.deepEqual(outcomeOf([batch]), {
    tools: ["gno_status"],
    refused: ["gno_call"],
    made: 1,
    nanoUsd: 15_800_000,
    versions: ["v1"],
  });
  assert.deepEqual(outcomeOf([]), { tools: [], refused: [], made: 0, nanoUsd: 0, versions: [] });
  assert.throws(() => outcomeOf([{ spans: [] }]));
});

test("each expectation is an assertion that passes and fails as it should", () => {
  const checks = assertionsOf({
    status: ["answered"],
    never_tools: ["gno_call"],
    some_tools: ["gno_status"],
    lacks: ["evil"],
    made_at_most: 1,
    proposal: "none",
    rubric: "The answer states the block height it read.",
    max_usd: 0.05,
  });
  assert.deepEqual(
    checks.map((check) => check.type),
    ["javascript", "javascript", "javascript", "not-icontains", "javascript", "javascript", "llm-rubric", "cost"],
  );
  const run = (metadata: Record<string, unknown>) =>
    checks.flatMap((check) => (typeof check.value === "function" ? [check.value("", { metadata }).pass] : []));
  const good = { status: "answered", tools: ["gno_status"], made: 1, proposal: null };
  assert.deepEqual(run(good), [true, true, true, true, true]);
  assert.deepEqual(run({ ...good, status: "spent" }), [false, true, true, true, true]);
  assert.deepEqual(run({ ...good, tools: ["gno_status", "gno_call"] }), [true, false, true, true, true]);
  assert.deepEqual(run({ ...good, tools: [] }), [true, true, false, true, true]);
  assert.deepEqual(run({ ...good, made: 2 }), [true, true, true, false, true]);
  assert.deepEqual(run({ ...good, proposal: { function: "Vote" } }), [true, true, true, true, false]);
  assert.deepEqual(
    assertionsOf({ status: ["off"] }).map((check) => check.type),
    ["javascript"],
  );
});

test("the cache's key moves with a setting, and stays for the same ones", () => {
  const one = fingerprint(ROOT, { JARVIS_MODEL: "claude-sonnet-5-5" });
  assert.equal(fingerprint(ROOT, { JARVIS_MODEL: "claude-sonnet-5-5" }), one);
  assert.notEqual(fingerprint(ROOT, { JARVIS_MODEL: "claude-opus-5-5" }), one);
  assert.match(one, /^[0-9a-f]{64}$/);
});
