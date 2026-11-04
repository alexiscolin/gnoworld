// A fake gnoscope for the client's tests: a real HTTP server on the loopback speaking MCP's streamable HTTP as gnoscope
// did live on 2026-11-04 (no session, protocol 2025-06-18, a GET answered 405, a notification 202, JSON answers), its
// tools those recorded that day unless a test gives others or pages of them; each request kept, and what a test
// asks of each answer.
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";

const Recorded = z.object({ tools: z.array(z.record(z.string(), z.unknown())) });

/** gnoscope's tools as its tools/list gave them on 2026-11-04. */
export const recordedTools = () =>
  Recorded.parse(JSON.parse(readFileSync(new URL("./gnoscopeTools.json", import.meta.url), "utf8"))).tools;

const Message = z.object({ id: z.unknown().optional(), method: z.string(), params: z.unknown().optional() });
const Call = z.object({ name: z.string(), arguments: z.unknown().optional() });

interface Scenario {
  tools?: unknown[];
  /** The list in pages, each but the last naming the next by its index as a cursor. */
  pages?: unknown[][];
  /** A tools/call's result, by its tool's name and arguments. */
  answer?: (name: string, args: unknown) => unknown;
  /** The time an answer to a method waits before it is written. */
  delayMs?: (method: string) => number;
  /** What to write instead of an answer: a status, a redirect, or a body. */
  instead?: (method: string) => { status: number; body?: string; location?: string } | undefined;
  /** A whole answer's body, written as given, built from the request's id. */
  raw?: (method: string, id: unknown) => string | undefined;
  /** A JSON-RPC error in place of a result. */
  fail?: (method: string) => { code: number; message: string } | undefined;
}

const freshness = (data: unknown) =>
  JSON.stringify({
    freshness: [{ network: "onyx", indexed_height: 883153, chain_height: 883221, blocks_behind: 68 }],
    data,
  });

const bodyOf = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  return Buffer.concat(chunks).toString("utf8");
};

function resultOf(message: z.infer<typeof Message>, scenario: Scenario): unknown {
  if (message.method === "initialize")
    return {
      protocolVersion: "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "gnoscope", version: "test" },
    };
  if (message.method === "tools/list") {
    if (scenario.pages === undefined) return { tools: scenario.tools ?? recordedTools() };
    const at = Number(z.object({ cursor: z.string().optional() }).parse(message.params ?? {}).cursor ?? "0");
    const next = at + 1 < scenario.pages.length ? { nextCursor: String(at + 1) } : {};
    return { tools: scenario.pages[at] ?? [], ...next };
  }
  const call = Call.parse(message.params);
  const answer = scenario.answer ?? ((name: string) => ({ content: [{ type: "text", text: freshness({ name }) }] }));
  return answer(call.name, call.arguments);
}

// A request's answer as written: the test's raw body, its JSON-RPC error, or the result.
function answerOf(message: z.infer<typeof Message>, scenario: Scenario): string {
  const raw = scenario.raw?.(message.method, message.id);
  if (raw !== undefined) return raw;
  const error = scenario.fail?.(message.method);
  const body = error === undefined ? { result: resultOf(message, scenario) } : { error };
  return JSON.stringify({ jsonrpc: "2.0", id: message.id, ...body });
}

export async function fakeGnoscope(scenario: Scenario = {}) {
  const requests: { method: string; params: unknown }[] = [];
  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== "POST") {
      response.writeHead(405, { "content-type": "application/json" }).end("{}");
      return;
    }
    const message = Message.parse(JSON.parse(await bodyOf(request)));
    requests.push({ method: message.method, params: message.params });
    await new Promise((resolve) => setTimeout(resolve, scenario.delayMs?.(message.method) ?? 0));
    const instead = scenario.instead?.(message.method);
    if (instead !== undefined) {
      const headers = instead.location === undefined ? {} : { location: instead.location };
      response.writeHead(instead.status, { "content-type": "application/json", ...headers }).end(instead.body ?? "");
      return;
    }
    if (message.id === undefined) {
      response.writeHead(202).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" }).end(answerOf(message, scenario));
  };
  const server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      response.writeHead(500).end(String(error));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("the fake gnoscope has no port");
  return {
    url: `http://127.0.0.1:${String(address.port)}/mcp`,
    requests,
    calls: () => requests.filter(({ method }) => method === "tools/call"),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}
