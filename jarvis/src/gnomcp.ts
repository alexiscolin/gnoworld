// gnomcp over stdio (ADR-0002 §5): one long-lived child for every question, started read-only in a fresh empty folder,
// its working directory and its home, so no profile, key or session file of anyone's is read, its keys and sessions
// kept there, jarvis's configuration named, its audit on stderr into jarvis's log; and checked at each start: 10b's
// reads there with every field ours allows, and every profile read-only (D86). A call goes only to a read of 10b's
// table with arguments its schema takes, has its timeout, and its result passes Zod; a child that ended starts again
// at the next call, 3 times in 10 minutes at most (D87).
import { jsonOf } from "@gnoworld/core";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Stream } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { Client, SdkError, SdkErrorCode } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { z } from "zod";
import type { Log } from "@gnoworld/service/log";
import { gnomcpTools } from "./gnomcpTools.ts";
import { shown } from "./tracing.ts";
import { visible } from "./untrusted.ts";

interface Setup {
  readonly command: string;
  readonly config: string;
  readonly profiles: { readonly read: readonly string[]; readonly indexed: readonly string[] };
  readonly log: Log;
  // A call's time and a start's, 30 s each by default, and the clock the restarts are counted on.
  readonly callTimeoutMs?: number | undefined;
  readonly startTimeoutMs?: number | undefined;
  readonly now?: (() => number) | undefined;
}
/** What running an allowed call gave: a text, the tool's own error, or why it gave nothing. */
type Failed = "timeout" | "down" | "malformed" | "error" | "refused";
export type Ran = { ok: true; text: string; isError: boolean } | { ok: false; reason: Failed };
export interface Gnomcp {
  call(name: string, args: unknown): Promise<Ran>;
  close(): Promise<void>;
}
interface Child {
  readonly client: Client;
  readonly home: string;
  alive: boolean;
  // Dropped by the transport for a message past its buffer: the message failed, not the child.
  oversized: boolean;
}

/** gnomcp started and checked; throws, the child ended and its folder removed, when a check fails. */
export async function startGnomcp(setup: Setup): Promise<Gnomcp> {
  const tools = toolsOf(setup);
  const timeout = setup.callTimeoutMs ?? 30_000;
  const starts = [setup.now?.() ?? Date.now()];
  let child = await spawn(setup);
  let closed = false;
  let starting: Promise<Child | undefined> | undefined;
  // At most 3 starts in 10 minutes, but for a child dropped for its message's size, which spends none of them.
  const counted = (at: number) => {
    while (at - (starts[0] ?? at) > 10 * 60_000) starts.shift();
    return starts.length < 3 && starts.push(at) !== 0;
  };
  const restart = async (): Promise<Child | undefined> => {
    if (!child.oversized && !counted(setup.now?.() ?? Date.now())) {
      setup.log("jarvis_gnomcp_down", { reason: "restarts" });
      return undefined;
    }
    rmSync(child.home, { recursive: true, force: true });
    try {
      child = await spawn(setup);
      return child;
    } catch (error) {
      setup.log("jarvis_gnomcp_down", { error: error instanceof Error ? error.message : String(error) });
      return undefined;
    }
  };
  // One start for the calls that find the child ended at once.
  const live = (): Promise<Child | undefined> => {
    if (child.alive) return Promise.resolve(child);
    starting ??= restart().finally(() => {
      starting = undefined;
    });
    return starting;
  };
  return {
    async call(name, args) {
      // ponytail: a find over 10b's table of seven reads.
      const parsed = tools.find((tool) => tool.name === name)?.args.safeParse(args);
      if (parsed?.success !== true) return { ok: false, reason: "refused" };
      const current = closed ? undefined : await live();
      if (current === undefined) return { ok: false, reason: "down" };
      return sent(current, { name, arguments: parsed.data }, timeout);
    },
    async close() {
      // A start under way ends first, so the child it makes is the one closed.
      closed = true;
      await starting;
      await child.client.close();
      rmSync(child.home, { recursive: true, force: true });
    },
  };
}

const timedOut = (error: unknown) => error instanceof SdkError && error.code === SdkErrorCode.RequestTimeout;

async function sent(child: Child, params: Parameters<Client["callTool"]>[0], timeout: number): Promise<Ran> {
  try {
    return read(await child.client.callTool(params, { timeout }));
  } catch (error) {
    if (timedOut(error)) return { ok: false, reason: "timeout" };
    // The client calls onclose before it fails the requests a closed connection leaves (its Protocol's _onclose).
    return { ok: false, reason: child.alive ? "error" : "down" };
  }
}

async function spawn(setup: Setup): Promise<Child> {
  const timeout = setup.startTimeoutMs ?? 30_000;
  const home = realpathSync(mkdtempSync(join(tmpdir(), "jarvis-gnomcp-")));
  const flags = ["-config", setup.config, "-audit-path", "/dev/stderr", "-audit-reads"];
  const transport = new StdioClientTransport({
    command: setup.command,
    args: [...flags, "-sessions-path", join(home, "sessions")],
    // Merged with the SDK's six inherited names (HOME, LOGNAME, PATH, SHELL, TERM, USER), HOME replaced.
    env: { HOME: home, GNOMCP_AGENT_KEYS_PATH: join(home, "agent-keys") },
    cwd: home,
    stderr: "pipe",
    maxBufferSize: 1024 * 1024,
  });
  logLines(transport.stderr, setup.log);
  const client = new Client({ name: "jarvis", version: "1.0.0" });
  const child: Child = { client, home, alive: true, oversized: false };
  client.onclose = () => {
    child.alive = false;
  };
  // MCP's ReadBuffer says so only in its error's words (@modelcontextprotocol/client 2.4.0, pinned, and tested here).
  client.onerror = (error) => {
    if (!error.message.startsWith("ReadBuffer exceeded maximum size")) return;
    child.oversized = true;
    setup.log("jarvis_gnomcp_down", { reason: "oversized" });
  };
  try {
    await atStart(client.connect(transport, { timeout }));
    await checked(client, setup, timeout);
    return child;
  } catch (error) {
    // A start refused ends its child and leaves no folder behind.
    await client.close();
    rmSync(home, { recursive: true, force: true });
    throw error;
  }
}

// An MCP request at start, its failure said in one of two words: gnomcp did not answer, or it stopped.
async function atStart<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (cause) {
    throw new Error(timedOut(cause) ? "gnomcp: it did not answer at start" : "gnomcp: it stopped at start", { cause });
  }
}

// 10b's reads for Jarvis's profiles, the one source of what a call may name and what gnomcp must list.
const toolsOf = ({ profiles }: Setup) => gnomcpTools({ chains: profiles.read, indexed: profiles.indexed });

async function checked(client: Client, setup: Setup, timeout: number): Promise<void> {
  // What follows reads gnomcp 0.11.0's words (its tools' fields, its kind "read-only"): another version may mean others.
  const { name = "?", version = "?" } = client.getServerVersion() ?? {};
  if (name !== "gnomcp" || version !== "0.11.0")
    throw new Error(`gnomcp: it is ${visible(`${name} ${version}`, false)}, not gnomcp 0.11.0`);
  // The client parsed the list by MCP's own schema: each tool a name and an input schema of properties.
  const { tools } = await atStart(client.listTools(undefined, { timeout }));
  const fields = new Map(tools.map((tool) => [tool.name, Object.keys(tool.inputSchema.properties ?? {})]));
  for (const { name, args } of toolsOf(setup)) {
    const theirs = fields.get(name);
    if (theirs === undefined) throw new Error(`gnomcp: no tool ${name}`);
    const missing = Object.keys(args.shape).find((field) => !theirs.includes(field));
    if (missing !== undefined) throw new Error(`gnomcp: ${name} has no field ${missing}`);
  }
  const Profile = z.object({ name: z.string(), kind: z.string(), tx_indexer_url: z.string() });
  const Profiles = z.object({ profiles: z.array(Profile) });
  const Listed = z.object({ isError: z.literal(false).optional(), structuredContent: Profiles });
  const answer = await atStart(client.callTool({ name: "gno_profile_list", arguments: {} }, { timeout }));
  const listed = Listed.safeParse(answer);
  if (!listed.success) throw new Error("gnomcp: its profile list is not gnomcp 0.11.0's");
  readOnly(listed.data.structuredContent.profiles, setup.profiles);
}

// gnomcp 0.11.0's own word for a chain it can never write (internal/profiles/config.go, Kind), each of Jarvis's
// chains among them, and an indexer behind each one Jarvis reads the indexer of.
function readOnly(profiles: { name: string; kind: string; tx_indexer_url: string }[], ours: Setup["profiles"]): void {
  const writable = profiles.find((profile) => profile.kind !== "read-only");
  const named = writable && `${visible(writable.name, false)} is ${visible(writable.kind, false)}`;
  if (named !== undefined) throw new Error(`gnomcp: the profile ${named}, not read-only`);
  const byName = new Map(profiles.map((profile) => [profile.name, profile]));
  const missing = ours.read.find((name) => !byName.has(name));
  if (missing !== undefined) throw new Error(`gnomcp: no profile ${missing}`);
  const blind = ours.indexed.find((name) => (byName.get(name)?.tx_indexer_url ?? "") === "");
  if (blind !== undefined) throw new Error(`gnomcp: the profile ${blind} has no indexer`);
}

function read(result: unknown): Ran {
  const Text = z.object({ type: z.literal("text"), text: z.string() });
  const Resource = z.object({ type: z.literal("resource"), resource: z.object({ text: z.string() }) });
  const Result = z.object({ content: z.array(z.union([Text, Resource])).min(1), isError: z.boolean().optional() });
  const parsed = Result.safeParse(result);
  if (!parsed.success) return { ok: false, reason: "malformed" };
  const text = parsed.data.content.map((part) => (part.type === "text" ? part.text : part.resource.text)).join("\n");
  return { ok: true, text, isError: parsed.data.isError === true };
}

// A stream's lines into the log, each kept to 64 KiB, so a line with no end holds no more.
function logLines(stream: Stream | null, log: Log): void {
  const decoder = new StringDecoder();
  let kept = "";
  stream?.on("data", (chunk: Buffer) => {
    const parts = (kept + decoder.write(chunk)).split("\n");
    kept = (parts.pop() ?? "").slice(0, 64 * 1024);
    for (const line of parts) logLine(log, line);
  });
}

// An audit line, JSON, by its tool, its result and its time alone: its arguments are the model's, so a question's.
// Any other JSON line logs no word of it either; a line of gnomcp's own words, cut, its hidden characters shown.
function logLine(log: Log, line: string): void {
  if (line.trim() === "") return;
  if (!/^\s*[[{]/.test(line)) {
    // Up to its first brace: an audit line written into an unended line of words is no word of gnomcp's.
    const end = line.indexOf("{");
    log("jarvis_gnomcp_stderr", { error: visible(line.slice(0, Math.min(512, end === -1 ? 512 : end)), false) });
    return;
  }
  // What is no JSON reaches the schema as nothing, which it refuses.
  const audit = z.object({ tool: z.string(), result: z.string(), duration_ms: z.number() }).safeParse(jsonOf(line));
  // A malformed line's tool and result are no names, so shown as <malformed>, with no time.
  const {
    tool,
    result,
    duration_ms: ms,
  } = audit.success ? audit.data : { tool: "", result: "", duration_ms: undefined };
  log("jarvis_gnomcp_audit", { tool: shown(tool), reason: shown(result), ...(ms === undefined ? {} : { ms }) });
}
