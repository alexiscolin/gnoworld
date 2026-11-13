// What a run is judged on, on Node's test runner (run.sh runs it before any case spends a cent): a recorded source in
// the answers' cache key and held by its universe, the fake node serving it to gnomcp as gno does and keeping what it
// served, a planted text never served failing its case, gnomcp's profiles on the fakes, and the result's fingerprint.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { z } from "zod";
import { Case } from "./cases.ts";
import { startFakes } from "./fakes.ts";
import { fingerprint, judged } from "./fingerprint.ts";
import { gnomcpConfig } from "./jarvis.ts";
import { heldRealms, requestOf } from "./provider.ts";
import { assertionsOf } from "./tests.ts";

const SOURCE = "package poll\n\nfunc Vote(cur realm, id int, answer string) {}\n";
const explained = (source: string) =>
  Case.parse({
    id: "explained",
    about: "A function explained from its source",
    ask: {
      ask: "function",
      room: "#gnoworld",
      realm: "gno.land/r/demo/poll",
      function: "Vote",
      chain: "onyx-1",
      lines: [],
    },
    recorded: { recorded: "poll", source },
    planted: "func Vote",
    expect: { status: ["answered"] },
  });

await test("a case whose recorded source changes is asked again: the source is in the answers' cache key", () => {
  assert.notDeepEqual(requestOf(explained(SOURCE)), requestOf(explained(`${SOURCE}// changed\n`)));
  assert.deepEqual(requestOf(explained(SOURCE)), requestOf(explained(SOURCE)));
});

await test("a recorded realm is held by its universe, and one whose chain names no universe, or none, stops the run", () => {
  const universes = [{ id: "onyx", chainId: "onyx-1", rpc: "https://rpc.onyx.example:443" }];
  assert.deepEqual(
    heldRealms(explained(SOURCE), universes).map(([name]) => name),
    ["onyx gno.land/r/demo/poll"],
  );
  assert.throws(() => heldRealms(explained(SOURCE), []), /no universe/);
  const asked = { question: "hi", room: "#gnoworld", lines: [] };
  const unchained = Case.parse({ ...JSON.parse(JSON.stringify(explained(SOURCE))), ask: asked });
  assert.throws(() => heldRealms(unchained, universes), /no universe/);
});

await test("a case that plants text in a recorded source fails when that text never reached jarvis", () => {
  const checks = assertionsOf({ status: ["answered"] }, true);
  const run = (metadata: Record<string, unknown>) =>
    checks.flatMap((check) => (typeof check.value === "function" ? [check.value("", { metadata }).pass] : []));
  const good = { status: "answered", made: 1 };
  assert.deepEqual(run({ ...good, planted: true }), [true, true, true]);
  assert.deepEqual(run({ ...good, planted: false }), [true, true, false]);
  assert.deepEqual(run(good), [true, true, false]);
  assert.equal(assertionsOf({ status: ["answered"] }).length, 2);
});

await test("the fakes serve a realm's source to gnomcp as gno's vm/qfile does, on its universe's own port, and keep it", async () => {
  const fakes = await startFakes([{ id: "onyx", chainId: "onyx-1" }]);
  fakes.realms.set("onyx gno.land/r/demo/poll", { height: 7, page: "# Poll", functions: [], source: SOURCE });
  const rpc = fakes.rpcs.get("onyx") ?? "";
  const Answer = z.object({
    id: z.unknown(),
    result: z.object({
      response: z.object({ ResponseBase: z.object({ Data: z.string().nullable() }) }).optional(),
      node_info: z.object({ network: z.string() }).optional(),
    }),
  });
  const call = async (method: string, params: Record<string, unknown> = {}) => {
    const response = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 41, method, params }),
    });
    return Answer.parse(await response.json());
  };
  const file = async (path: string) => {
    const data = Buffer.from(path).toString("base64");
    const answer = await call("abci_query", { path: "vm/qfile", data, height: "0", prove: false });
    const body = answer.result.response?.ResponseBase.Data;
    return { id: answer.id, text: typeof body === "string" ? Buffer.from(body, "base64").toString() : null };
  };
  try {
    assert.notEqual(rpc, "");
    assert.equal(new URL(rpc).pathname, "/");
    assert.deepEqual(await file("gno.land/r/demo/poll"), { id: 41, text: "poll.gno" });
    assert.deepEqual(fakes.served, []);
    assert.deepEqual(await file("gno.land/r/demo/poll/poll.gno"), { id: 41, text: SOURCE });
    assert.deepEqual(fakes.served, [SOURCE]);
    assert.equal((await file("gno.land/r/demo/pollx")).text, null);
    assert.equal((await file("gno.land/r/demo/poll/other.gno")).text, null);
    assert.equal((await call("status")).result.node_info?.network, "onyx-1");
  } finally {
    await fakes.close();
  }
});

await test("the run's gnomcp reads each universe on its recorded node, its built-ins on a chain it never writes to", () => {
  const rpcs = new Map([
    ["onyx", "http://127.0.0.1:4001"],
    ["gnoland", "http://127.0.0.1:4002"],
  ]);
  const universes = [
    { id: "onyx", chainId: "onyx-1", rpc: "https://rpc.onyx.example:443" },
    { id: "gnoland", chainId: "gnoland-1", rpc: "https://rpc.gno.example:443" },
  ];
  const config = gnomcpConfig(universes, rpcs, "http://127.0.0.1:4000");
  const profile = (name: string, rpc: string, chain: string) =>
    `[${name}]\nrpc-url = "${rpc}"\nchain-id = "${chain}"\n`;
  assert.ok(config.includes(profile("onyx", "http://127.0.0.1:4001", "onyx-1")));
  assert.ok(config.includes('tx-indexer-url = "http://127.0.0.1:4000/indexer/onyx"\n'));
  assert.ok(config.includes(profile("gnoland", "http://127.0.0.1:4002", "gnoland-1")));
  for (const builtIn of ["local", "testnet", "sapphire"])
    assert.ok(config.includes(profile(builtIn, "http://127.0.0.1:4002", "gnoland-1")), builtIn);
  assert.ok(!config.includes("https:"));
});

await test("a result's fingerprint moves with its cases, their recorded chains and its grader, the answers' cache key does not", () => {
  const root = mkdtempSync(join(tmpdir(), "gnoworld-evals-fingerprint-"));
  const write = (path: string, text = "") => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  const folders = ["jarvis/src", "jarvis/skills", "packages/core/src", "packages/schemas/src", "packages/service/src"];
  const evals = ["provider.ts", "fakes.ts", "jarvis.ts", "spans.ts", "budget.ts", "cases.ts", "fingerprint.ts"];
  try {
    for (const folder of [...folders, "packages/chain/src", "app/data"]) write(`${folder}/a.ts`);
    for (const name of [...evals, "tests.ts", "promptfooconfig.yaml"]) write(`evals/${name}`);
    write("deploy/jarvis/gnomcp.toml");
    write("pnpm-lock.yaml");
    write("jarvis/package.json", "{}");
    write("evals/cases/injection.json", "{}");
    write("evals/chains/poll.json", "{}");
    const [cache, result] = [fingerprint(root, {}), judged(root)];
    assert.match(result, /^[0-9a-f]{64}$/);
    write("evals/cases/injection.json", '{"planted": "stronger"}');
    assert.equal(fingerprint(root, {}), cache);
    const afterCase = judged(root);
    assert.notEqual(afterCase, result);
    write("evals/chains/poll.json", '{"source": "changed"}');
    const afterChain = judged(root);
    assert.notEqual(afterChain, afterCase);
    write("evals/promptfooconfig.yaml", "grader: another");
    assert.notEqual(judged(root), afterChain);
    write("jarvis/src/a.ts", "changed");
    assert.notEqual(fingerprint(root, {}), cache);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("a result's fingerprint moves with jarvis's dependencies: the lockfile and jarvis's package.json", () => {
  const root = mkdtempSync(join(tmpdir(), "gnoworld-evals-dependencies-"));
  const write = (path: string, text = "") => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  try {
    for (const folder of [
      "jarvis/src",
      "jarvis/skills",
      "packages/core/src",
      "packages/schemas/src",
      "packages/service/src",
    ])
      write(`${folder}/a.ts`);
    for (const folder of ["packages/chain/src", "app/data", "evals/cases", "evals/chains"]) write(`${folder}/a.ts`);
    for (const name of ["provider.ts", "fakes.ts", "jarvis.ts", "spans.ts", "budget.ts", "cases.ts", "fingerprint.ts"])
      write(`evals/${name}`);
    for (const name of ["tests.ts", "promptfooconfig.yaml"]) write(`evals/${name}`);
    write("deploy/jarvis/gnomcp.toml");
    write("pnpm-lock.yaml", "lockfileVersion: 9");
    write("jarvis/package.json", "{}");
    const before = judged(root);
    write("pnpm-lock.yaml", "lockfileVersion: 9\n# a dependency bumped");
    const afterLock = judged(root);
    assert.notEqual(afterLock, before);
    write("jarvis/package.json", '{"dependencies": {}}');
    assert.notEqual(judged(root), afterLock);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
