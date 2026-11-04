// An eval run's recorded node and spans' receiver, on one loopback server (provider.ts): a realm by its universe and
// path, at the height its case recorded; jarvis's span batches, JSON alone. It answers a request naming its own
// loopback Host alone, as a page another site's DNS steers here names another (10j's review, S6).
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { queryEnvelope, statusEnvelope } from "../packages/chain/src/testing/envelopes.ts";
import { jsonOf } from "../packages/core/src/json/json.ts";
import type { Chain } from "./cases.ts";

// The most span batches a run keeps: a case's take a few, so a flood of forged ones stops here.
const BATCHES = 10_000;

export interface Fakes {
  server: Server;
  realms: Map<string, Chain>;
  batches: unknown[];
  // The height the node's status names: the last realm's recorded, as one case runs at a time.
  at: { height: number };
}

const reply = (response: ServerResponse, status: number, body: unknown = {}): void => {
  response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
};
const fromHex = (url: URL) => Buffer.from((url.searchParams.get("data") ?? "").replace(/^0x/, ""), "hex").toString();
const REFUSED = () => queryEnvelope({ data: null, error: { "@type": "/vm.InvalidPkgPathError" } });

// A universe's node, as the chain package reads it: its status naming its chain, a held realm's page and functions.
function nodeAnswer(fakes: Fakes, chains: ReadonlyMap<string, string>, url: URL): unknown {
  const [, universe = "", route = ""] = /^\/node\/([a-z0-9-]+)\/(.*)$/.exec(url.pathname) ?? [];
  if (route === "status") return statusEnvelope(fakes.at.height, "2026-11-05T00:00:00Z", chains.get(universe));
  const path = url.searchParams.get("path") ?? "";
  const data = fromHex(url);
  const page = path.includes("qrender") ? fakes.realms.get(`${universe} ${data.replace(/:.*$/, "")}`) : undefined;
  if (page !== undefined) return queryEnvelope({ data: page.page });
  const functions = path.includes("qfuncs") ? fakes.realms.get(`${universe} ${data}`) : undefined;
  return functions === undefined ? REFUSED() : queryEnvelope({ data: JSON.stringify(functions.functions) });
}

// A batch of jarvis's spans: JSON by its type and its text, under the cap.
function traced(fakes: Fakes, request: IncomingMessage, text: string): number {
  if (!/^application\/json(;|$)/i.test(request.headers["content-type"] ?? "")) return 415;
  if (fakes.batches.length >= BATCHES) return 413;
  const batch = jsonOf(text);
  if (batch === undefined) return 400;
  fakes.batches.push(batch);
  return 200;
}

/** The loopback server of a run, not yet listening, for these universes (their ids and chains). */
export function startFakes(universes: readonly { id: string; chainId: string }[]): Fakes {
  const chains = new Map(universes.map((one) => [one.id, one.chainId]));
  const server = createServer((request, response) => {
    answer(request, response).catch(() => {
      if (!response.headersSent) reply(response, 500);
    });
  });
  const fakes: Fakes = { server, realms: new Map(), batches: [], at: { height: 1 } };
  async function answer(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const address = server.address();
    const own = typeof address === "object" && address !== null ? `127.0.0.1:${String(address.port)}` : "";
    if (request.headers.host !== own) {
      reply(response, 421);
      return;
    }
    const url = new URL(request.url ?? "/", "http://fake");
    const chunks: Buffer[] = [];
    for await (const chunk of request) if (Buffer.isBuffer(chunk)) chunks.push(chunk);
    if (url.pathname === "/v1/traces") reply(response, traced(fakes, request, Buffer.concat(chunks).toString()));
    else reply(response, 200, nodeAnswer(fakes, chains, url));
  }
  return fakes;
}
