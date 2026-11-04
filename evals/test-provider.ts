// The provider end to end, on Node's test runner, against jarvis's own fake Anthropic (jarvis/src/testing) and gnomcp
// 0.11.0 for real (GNOMCP, as run.sh finds it): a case reaches jarvis's entry, its tool and cost come back from the
// spans, and the same case again costs no model call. No key, no chain: the tool is find_place, on the places' data.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { z } from "zod";
import { fakeAnthropic } from "../jarvis/src/testing/fakeAnthropic.ts";
import { message, text, toolUse } from "../jarvis/src/testing/fakeModel.ts";
import JarvisProvider, { startFakes } from "./provider.ts";

test("a case asks jarvis's real entry, gives its tools and cost, and is kept for the next run", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gnoworld-evals-test-"));
  const model = await fakeAnthropic([
    message({ content: [toolUse("t1", "find_place", { query: "onyx" })], stop: "tool_use" }),
    message({ content: [text("The onyx hub is in gnoworld's data.")], stop: "end_turn" }),
  ]);
  writeFileSync(join(dir, "key"), `sk-ant-made-up-${"k".repeat(40)}\n`);
  process.env["ANTHROPIC_API_KEY_FILE"] = join(dir, "key");
  const provider = new JarvisProvider({
    config: { JARVIS_PROFILES: "onyx", JARVIS_INDEXER_PROFILES: "onyx" },
    outbound: { "https://api.anthropic.com": model.origin },
    cache: join(dir, "cache"),
  });
  try {
    const one = {
      id: "provider-test",
      about: "The provider's own test",
      ask: { question: "Where is the onyx hub?", room: "#gnoworld", lines: [] },
      expect: { status: ["answered"] },
    };
    const vars = { vars: { case: JSON.stringify(one) } };
    const first = await provider.callApi("", vars);
    assert.equal(first["output"], "The onyx hub is in gnoworld's data.");
    assert.equal(first["cached"], undefined);
    const metadata = z.record(z.string(), z.unknown()).parse(first["metadata"]);
    assert.equal(metadata["status"], "answered");
    assert.deepEqual(metadata["tools"], ["find_place"]);
    assert.equal(metadata["made"], 1);
    assert.ok(Number(first["cost"]) > 0);
    assert.equal(model.seen.length, 2);
    const again = await provider.callApi("", vars);
    assert.equal(again["cached"], true);
    assert.equal(again["output"], first["output"]);
    assert.equal(model.seen.length, 2);
  } finally {
    await provider.cleanup();
    await model.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the loopback receiver takes jarvis's JSON spans alone, by its own Host, and refuses the rest (10j's review, S6)", async () => {
  const fakes = startFakes();
  await new Promise<void>((resolve) => fakes.server.listen(0, "127.0.0.1", resolve));
  const address = fakes.server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  const origin = `http://127.0.0.1:${String(port)}`;
  const post = (body: string, headers: Record<string, string>) =>
    fetch(`${origin}/v1/traces`, { method: "POST", body, headers }).then((response) => response.status);
  try {
    const json = { "content-type": "application/json" };
    assert.equal(await post(JSON.stringify({ resourceSpans: [] }), json), 200);
    assert.equal(await post("{}", { "content-type": "text/plain" }), 415);
    assert.equal(await post("{nope", json), 400);
    // A page another site's DNS steers here names its own host.
    const steered = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(
        { host: "127.0.0.1", port, path: "/v1/traces", method: "POST", headers: { ...json, host: "evil.test" } },
        (response) => resolve(response.statusCode ?? 0),
      );
      request.on("error", reject);
      request.end("{}");
    });
    assert.equal(steered, 421);
    assert.equal(fakes.batches.length, 1);
  } finally {
    fakes.server.close();
  }
});
