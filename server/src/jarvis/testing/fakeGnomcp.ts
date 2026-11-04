// A fake gnomcp for gnomcp.ts's tests: a real child process speaking MCP's JSON-RPC over stdio, written to a folder
// of its own at each test from the script below, as testing/ergo.ts writes Ergo's auth script. It lists gnomcp
// 0.11.0's tools with their live schemas' fields, answers gno_profile_list with the scenario's profiles, writes an
// audit line on stderr for each call, and keeps what it was started with and every request it read, for the test.
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import { z } from "zod";

interface Tool {
  name: string;
  inputSchema: { type: "object"; properties: Record<string, unknown> };
}
interface Profile {
  name: string;
  chain_id: string;
  kind: string;
  tx_indexer_url: string;
}
export interface Scenario {
  tools?: Tool[];
  profiles?: Profile[];
  // A tool's result by its name; any other call is answered with its name and arguments.
  answers?: Record<string, unknown>;
  // Tools, or protocol methods such as `initialize`, it never answers; tools it answers with a JSON-RPC error.
  slow?: string[];
  failing?: string[];
  // A tool whose call ends the process, in its first `starts` starts.
  crash?: { tool: string; starts: number };
  stderr?: string[];
  // Each stderr line written in two halves, 50 ms apart, before any request is read; words written with no line end
  // before each audit line, which then ends theirs.
  stderrSplit?: boolean;
  stderrBefore?: string;
  exitAtStart?: boolean;
  // The name and version it gives at initialize, gnomcp 0.11.0 by default.
  server?: { name: string; version: string };
}

const fields = (...names: string[]) => Object.fromEntries(names.map((name) => [name, { type: "string" }]));
const tool = (name: string, ...names: string[]): Tool => ({
  name,
  inputSchema: { type: "object", properties: fields(...names) },
});

/** gnomcp 0.11.0's seven reads, each with its live schema's fields (ToolSearch, 2026-11-04), and two of its writes. */
export const gnomcpListing = (): Tool[] => [
  tool("gno_packages", "limit", "path", "profile"),
  tool("gno_read", "file", "full", "path", "profile", "symbols"),
  tool("gno_render", "path", "profile", "realm"),
  tool("gno_eval", "expr", "path", "profile"),
  tool("gno_status", "profile"),
  tool("gno_history", "profile", "realm"),
  tool("gno_activity", "profile", "realm", "since", "until"),
  tool("gno_call", "args", "func", "identity", "key", "profile", "realm", "send", "simulate"),
  tool("gno_addpkg", "deploy_path", "files", "key", "profile", "simulate"),
  tool("gno_profile_list"),
];

/** Jarvis's chains in a test: onyx with its indexer, and betanet, both read-only as gnomcp 0.11.0 classes them. */
export const readOnlyProfiles = (): Profile[] => [
  { name: "betanet", chain_id: "gnoland1", kind: "read-only", tx_indexer_url: "" },
  { name: "onyx", chain_id: "onyx-1", kind: "read-only", tx_indexer_url: "https://indexer.onyx.example/graphql/query" },
];

const SCRIPT = `import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
const here = dirname(process.argv[1]);
const scenario = JSON.parse(readFileSync(join(here, "scenario.json"), "utf8"));
const started = (() => {
  try {
    return readFileSync(join(here, "starts.jsonl"), "utf8").split("\\n").filter(Boolean).length;
  } catch {
    return 0;
  }
})();
const env = {};
// The six names the transport inherits but HOME, and the one macOS adds to every process it starts.
const ignored = ["PATH", "LOGNAME", "SHELL", "TERM", "USER", "__CF_USER_TEXT_ENCODING"];
for (const [key, value] of Object.entries(process.env)) if (!ignored.includes(key)) env[key] = value;
const seen = { argv: process.argv.slice(2), cwd: process.cwd(), env, listed: readdirSync(process.cwd()), pid: process.pid };
appendFileSync(join(here, "starts.jsonl"), JSON.stringify(seen) + "\\n");
for (const line of scenario.stderr ?? []) {
  if (!scenario.stderrSplit) process.stderr.write(line + "\\n");
  else {
    process.stderr.write(line.slice(0, line.length / 2));
    setTimeout(() => process.stderr.write(line.slice(line.length / 2) + "\\n"), 50);
  }
}
if (scenario.exitAtStart) process.exit(3);
const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\\n");
const call = (id, name, args) => {
  if (scenario.crash && scenario.crash.tool === name && started < scenario.crash.starts) process.exit(1);
  if ((scenario.slow ?? []).includes(name)) return;
  if ((scenario.failing ?? []).includes(name)) return send({ id, error: { code: -32603, message: "a made-up failure" } });
  const listed = { content: [{ type: "text", text: "profiles" }], structuredContent: { profiles: scenario.profiles } };
  const echoed = { content: [{ type: "text", text: name + " " + JSON.stringify(args) }] };
  const result = scenario.answers?.[name] ?? (name === "gno_profile_list" ? listed : echoed);
  const audit = { time: "2026-11-04T00:00:00Z", tool: name, profile: "onyx", args_summary: JSON.stringify(args ?? {}), result: result.isError ? "tool_err" : "ok", duration_ms: 3 };
  process.stderr.write((scenario.stderrBefore ?? "") + JSON.stringify(audit) + "\\n");
  send({ id, result });
};
const serve = () => createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line);
  appendFileSync(join(here, "requests.jsonl"), JSON.stringify({ start: started + 1, method: request.method, params: request.params }) + "\\n");
  if (request.id === undefined || (scenario.slow ?? []).includes(request.method)) return;
  if (request.method === "initialize") {
    const result = { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: scenario.server ?? { name: "gnomcp", version: "0.11.0" } };
    return send({ id: request.id, result });
  }
  if (request.method === "tools/list") return send({ id: request.id, result: { tools: scenario.tools } });
  if (request.method === "tools/call") return call(request.id, request.params.name, request.params.arguments);
  send({ id: request.id, error: { code: -32601, message: "no such method" } });
});
if (scenario.stderrSplit) setTimeout(serve, 100);
else serve();
`;

const Seen = z.object({
  argv: z.array(z.string()),
  cwd: z.string(),
  env: z.record(z.string(), z.string()),
  listed: z.array(z.string()),
  pid: z.number(),
});
const Read = z.object({ start: z.number(), method: z.string(), params: z.unknown().optional() });
const lines = (path: string) => {
  try {
    return readFileSync(path, "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
};

const folders: string[] = [];
afterEach(() => {
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A fake gnomcp's executable, and what it saw: each start's arguments, environment and folder, and each request. */
export const fakeGnomcp = (scenario: Scenario = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "gnoworld-fake-gnomcp-"));
  folders.push(dir);
  // The scenario is read at each start, so a change reaches the next one.
  const change = (next: Scenario) => {
    writeFileSync(
      join(dir, "scenario.json"),
      JSON.stringify({ tools: gnomcpListing(), profiles: readOnlyProfiles(), ...next }),
    );
  };
  change(scenario);
  const command = join(dir, "gnomcp.mjs");
  writeFileSync(command, `#!${process.execPath}\n${SCRIPT}`);
  chmodSync(command, 0o755);
  return {
    command,
    change,
    starts: () => lines(join(dir, "starts.jsonl")).map((line) => Seen.parse(JSON.parse(line))),
    requests: () => lines(join(dir, "requests.jsonl")).map((line) => Read.parse(JSON.parse(line))),
  };
};
