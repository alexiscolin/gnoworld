// The provider end to end, on Node's test runner, against jarvis's own fake Anthropic (jarvis/src/testing) and gnomcp
// 0.11.0 for real (GNOMCP, as run.sh finds it): a case reaches jarvis's entry, its tool and cost come back from the
// spans, and the same case again costs no model call. No key, no chain: the tool is find_place, on the places' data.
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { z } from "zod";
import { fakeAnthropic } from "../jarvis/src/testing/fakeAnthropic.ts";
import { message, text, toolUse } from "../jarvis/src/testing/fakeModel.ts";
import { startFakes } from "./fakes.ts";
import JarvisProvider from "./provider.ts";

const ONE = {
  id: "provider-test",
  about: "The provider's own test",
  ask: { question: "Where is the onyx hub?", room: "#gnoworld", lines: [] },
  expect: { status: ["answered"] },
};
const VARS = { vars: { case: JSON.stringify(ONE) } };
const ANSWER = "The onyx hub is in gnoworld's data.";

// A provider on a fake Anthropic answering `steps`, its runs and its cache in a folder of the test's.
async function withProvider(
  steps: Parameters<typeof fakeAnthropic>[0],
  use: (provider: JarvisProvider, model: Awaited<ReturnType<typeof fakeAnthropic>>, dir: string) => Promise<void>,
) {
  const dir = mkdtempSync(join(tmpdir(), "gnoworld-evals-test-"));
  const model = await fakeAnthropic(steps);
  writeFileSync(join(dir, "key"), `sk-ant-made-up-${"k".repeat(40)}\n`);
  process.env["ANTHROPIC_API_KEY_FILE"] = join(dir, "key");
  const provider = new JarvisProvider({
    config: { JARVIS_PROFILES: "onyx", JARVIS_INDEXER_PROFILES: "onyx" },
    outbound: { "https://api.anthropic.com": model.origin },
    cache: join(dir, "cache"),
    scratch: join(dir, "runs"),
  });
  try {
    await use(provider, model, dir);
  } finally {
    await provider.cleanup();
    await model.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

await test("a case asks jarvis's real entry, gives its tools and cost, and is kept for the next run", async () => {
  const steps = [
    message({ content: [toolUse("t1", "find_place", { query: "onyx" })], stop: "tool_use" }),
    message({ content: [text(ANSWER)], stop: "end_turn" }),
  ];
  await withProvider(steps, async (provider, model) => {
    const first = await provider.callApi("", VARS);
    assert.equal(first.output, ANSWER);
    assert.equal(first.cached, undefined);
    const metadata = z.record(z.string(), z.unknown()).parse(first.metadata);
    assert.equal(metadata["status"], "answered");
    assert.deepEqual(metadata["tools"], ["find_place"]);
    assert.equal(metadata["made"], 1);
    assert.ok(first.cost > 0);
    assert.equal(model.seen.length, 2);
    const again = await provider.callApi("", VARS);
    assert.equal(again.cached, true);
    assert.equal(again.output, ANSWER);
    assert.equal(model.seen.length, 2);
  });
});

await test("a declined question is kept for the next run, with its status for the checks", async () => {
  const steps = [message({ content: [toolUse("t1", "decline", {})], stop: "tool_use" })];
  await withProvider(steps, async (provider, model) => {
    const first = await provider.callApi("", VARS);
    assert.equal(z.record(z.string(), z.unknown()).parse(first.metadata)["status"], "declined");
    assert.ok(first.cost > 0);
    const again = await provider.callApi("", VARS);
    assert.equal(again.cached, true);
    assert.equal(z.record(z.string(), z.unknown()).parse(again.metadata)["status"], "declined");
    assert.equal(model.seen.length, 1);
  });
});

await test("a failed answer is never kept: the next run asks again (10j's review, V4)", async () => {
  const steps = [
    { status: 400, error: "invalid_request_error" },
    message({ content: [text(ANSWER)], stop: "end_turn" }),
  ];
  await withProvider(steps, async (provider, model) => {
    const failed = await provider.callApi("", VARS);
    assert.notEqual(failed.output, ANSWER);
    assert.equal(model.seen.length, 1);
    const asked = await provider.callApi("", VARS);
    assert.equal(asked.cached, undefined);
    assert.equal(asked.output, ANSWER);
    assert.equal(model.seen.length, 2);
  });
});

await test("a run's end waits for jarvis to stop and leaves no folder behind (10j's review, V6)", async () => {
  await withProvider([message({ content: [text(ANSWER)], stop: "end_turn" })], async (provider, _, dir) => {
    await provider.callApi("", VARS);
    assert.equal(readdirSync(join(dir, "runs")).length, 1);
    await provider.cleanup();
    assert.deepEqual(readdirSync(join(dir, "runs")), []);
  });
});

await test("the loopback receiver takes jarvis's JSON spans alone, by its own Host, and refuses the rest (10j's review, S6)", async () => {
  const fakes = await startFakes([]);
  const port = Number(new URL(fakes.origin).port);
  const post = (body: string, headers: Record<string, string>) =>
    new Promise<number>((resolve, reject) => {
      const sent = httpRequest({ host: "127.0.0.1", port, path: "/v1/traces", method: "POST", headers }, (response) => {
        resolve(response.statusCode ?? 0);
      });
      sent.on("error", reject);
      sent.end(body);
    });
  try {
    const json = { "content-type": "application/json" };
    assert.equal(await post(JSON.stringify({ resourceSpans: [] }), json), 200);
    assert.equal(await post("{}", { "content-type": "text/plain" }), 415);
    assert.equal(await post("{nope", json), 400);
    // A page another site's DNS steers here names its own host.
    assert.equal(await post("{}", { ...json, host: "evil.test" }), 421);
    assert.equal(fakes.batches.length, 1);
  } finally {
    await fakes.close();
  }
});
