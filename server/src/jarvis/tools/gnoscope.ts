// gnoscope's client (ADR-0002 §5; D104, D105): a third party behind JARVIS_GNOSCOPE, off by default and then never
// asked. On, its tools are listed once at start over MCP's streamable HTTP, every page, and ours alone are taken, each
// with our schema and words, when it lists every field of ours. Every request goes through net.ts's send (its time, no
// redirect) and an answer past 1 MiB is cut off; a call is our read with the arguments our schema took, its result
// through Zod. Down, slow or no MCP at start, it offers nothing until jarvis starts again.
import { Client, SdkError, SdkErrorCode, StreamableHTTPClientTransport, type Tool } from "@modelcontextprotocol/client";
import { z } from "zod";
import type { Log } from "../../log.ts";
import { send } from "../../net.ts";
import type { Ran } from "../gnomcp.ts";
import { gnoscopeTools } from "./gnoscopeTools.ts";

interface Setup {
  readonly on: boolean;
  readonly url: string;
  readonly timeoutMs: number;
  readonly networks: readonly string[];
  readonly log: Log;
}

interface Gnoscope {
  readonly definitions: readonly ReturnType<typeof gnoscopeTools>[number][];
  call(name: string, args: unknown): Promise<Ran>;
  close(): Promise<void>;
}

const MAX_BYTES = 1024 * 1024;
// An answer this client does not read: past 1 MiB, or an event stream.
class Unread extends Error {}

// A fetch through net.ts, its body cut off once it passes 1 MiB, so a third party's answer holds no more. gnoscope
// answers JSON (read live, 2026-11-04); an event stream is refused, as the client's reader of one ends no call (D108).
const cappedFetch = (timeoutMs: number) => async (url: string | URL, init?: RequestInit) => {
  const response = await send(String(url), init ?? {}, timeoutMs);
  if (response.headers.get("content-type")?.startsWith("text/event-stream") === true) {
    await response.body?.cancel();
    throw new Unread();
  }
  if (response.body === null) return response;
  let size = 0;
  const cap = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > MAX_BYTES) controller.error(new Unread());
      else controller.enqueue(chunk);
    },
  });
  const { status, statusText, headers } = response;
  return new Response(response.body.pipeThrough(cap), { status, statusText, headers });
};

const none = (): Gnoscope => ({
  definitions: [],
  call: () => Promise.resolve({ ok: false, reason: "refused" }),
  close: () => Promise.resolve(),
});

/** gnoscope's reads Jarvis takes: none when its switch is off or it does not answer at start; never throws. */
export async function startGnoscope(setup: Setup): Promise<Gnoscope> {
  if (!setup.on) return none();
  // Four pages of tools at most, each within its time; gnoscope listed seven on one page (2026-11-04).
  const client = new Client({ name: "jarvis", version: "1.0.0" }, { listMaxPages: 4 });
  const transport = new StreamableHTTPClientTransport(new URL(setup.url), {
    fetch: cappedFetch(setup.timeoutMs),
    reconnectionOptions: {
      maxRetries: 0,
      initialReconnectionDelay: 1_000,
      maxReconnectionDelay: 1_000,
      reconnectionDelayGrowFactor: 1,
    },
  });
  let listed: Tool[];
  try {
    await client.connect(transport, { timeout: setup.timeoutMs });
    // The client reads every page of the list itself (listTools at 2.4.0), each within its time.
    ({ tools: listed } = await client.listTools(undefined, { timeout: setup.timeoutMs }));
  } catch {
    // A third party never stops jarvis's start: without it, Jarvis answers from gnomcp.
    setup.log("jarvis_gnoscope_down", { reason: "start" });
    await client.close();
    return none();
  }
  const definitions = taken(listed, setup);
  let closed = false;
  return {
    definitions,
    async call(name, args) {
      const parsed = definitions.find((definition) => definition.name === name)?.args.safeParse(args);
      if (parsed?.success !== true) return { ok: false, reason: "refused" };
      if (closed) return { ok: false, reason: "down" };
      try {
        // Our own definition, with no output schema: the client checks none of gnoscope's against a result (S1).
        const toolDefinition = { name, inputSchema: { type: "object" as const } };
        return read(
          await client.callTool({ name, arguments: parsed.data }, { timeout: setup.timeoutMs, toolDefinition }),
        );
      } catch (error) {
        return { ok: false, reason: failureOf(error) };
      }
    },
    async close() {
      closed = true;
      await client.close();
    },
  };
}

// Ours that gnoscope lists with every field of ours; each other one left out, and logged.
function taken(listed: readonly Tool[], setup: Setup): Gnoscope["definitions"] {
  const fields = new Map(listed.map((tool) => [tool.name, Object.keys(tool.inputSchema.properties ?? {})]));
  return gnoscopeTools(setup.networks).filter(({ name, args }) => {
    const theirs = fields.get(name);
    const reason =
      theirs === undefined
        ? "not_listed"
        : Object.keys(args.shape).every((field) => theirs.includes(field))
          ? ""
          : "fields";
    if (reason !== "") setup.log("jarvis_gnoscope_dropped", { tool: name, reason });
    return reason === "";
  });
}

// Why a call gave nothing: an answer too large or a stream, no JSON, or no result Zod takes; the client's own failure; else gnoscope
// unreached, or its JSON-RPC error.
function failureOf(error: unknown): "timeout" | "malformed" | "down" | "error" {
  for (let cause: unknown = error; cause instanceof Error; cause = cause.cause)
    if (cause instanceof Unread || cause instanceof SyntaxError || cause instanceof z.ZodError) return "malformed";
  if (error instanceof SdkError) return clientFailure(error.code);
  return error instanceof TypeError ? "down" : "error";
}

// The client's failure: its time up, a result its schema refuses, or gnoscope unreached.
function clientFailure(code: SdkErrorCode): "timeout" | "malformed" | "down" {
  if (code === SdkErrorCode.RequestTimeout) return "timeout";
  return code === SdkErrorCode.InvalidResult ? "malformed" : "down";
}

function read(result: unknown): Ran {
  const Text = z.object({ type: z.literal("text"), text: z.string() });
  const Result = z.object({ content: z.array(Text).min(1), isError: z.boolean().optional() });
  const parsed = Result.safeParse(result);
  if (!parsed.success) return { ok: false, reason: "malformed" };
  return {
    ok: true,
    text: parsed.data.content.map(({ text }) => text).join("\n"),
    isError: parsed.data.isError === true,
  };
}
