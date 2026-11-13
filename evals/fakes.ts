// An eval run's recorded node and spans' receiver, on loopback servers (provider.ts): a realm by its universe and
// path, at the height its case recorded, to jarvis's reads and to gnomcp's; jarvis's span batches, JSON alone. Each
// answers a request naming its own loopback Host alone, as a page another site's DNS steers here names another (10j's
// review, S6).
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { bodyOf, onLoopback } from "../jarvis/src/testing/loopback.ts";
import { queryEnvelope, statusEnvelope } from "../packages/chain/src/testing/envelopes.ts";
import { jsonOf } from "../packages/core/src/json/json.ts";
import type { Chain } from "./cases.ts";

// The most span batches a run keeps: a case's take a few, so a flood of forged ones stops here.
const BATCHES = 10_000;
const TIME = "2026-11-05T00:00:00Z";

interface Held {
  realms: Map<string, Chain>;
  batches: unknown[];
  // The height the node's status names: the last realm's recorded, as one case runs at a time.
  at: { height: number };
  // Every recorded source a query was given, so a case can tell its planted text reached jarvis.
  served: string[];
}
export interface Fakes extends Held {
  origin: string;
  // Each universe's node for gnomcp, by its id: an origin of its own.
  rpcs: ReadonlyMap<string, string>;
  close: () => Promise<void>;
}

const reply = (response: ServerResponse, status: number, body: unknown = {}): void => {
  response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
};
const fromHex = (url: URL) => Buffer.from((url.searchParams.get("data") ?? "").replace(/^0x/, ""), "hex").toString();
const REFUSED = () => queryEnvelope({ data: null, error: { "@type": "/vm.InvalidPkgPathError" } });

// The one file a recorded realm holds, named after the realm.
const fileOf = (realm: string) => `${realm.slice(realm.lastIndexOf("/") + 1)}.gno`;

// A realm's recorded source as gno's vm/qfile answers (gno v1.5.0, sdk/vm/keeper.go:1930): the realm's own path lists
// its files, here its one; that file's path gives its text, kept in `served`.
function sourceOf(fakes: Held, universe: string, data: string): string | undefined {
  const realm = (path: string) => fakes.realms.get(`${universe} ${path}`);
  if (realm(data)?.source !== undefined) return fileOf(data);
  const parent = data.slice(0, data.lastIndexOf("/"));
  const source = realm(parent)?.source;
  if (source === undefined || data !== `${parent}/${fileOf(parent)}`) return undefined;
  fakes.served.push(source);
  return source;
}

// What a query of a universe's node holds: a realm's page (vm/qrender), its source (vm/qfile) or its functions (vm/qfuncs).
function dataOf(fakes: Held, universe: string, { path, data }: { path: string; data: string }): string | undefined {
  const realm = (name: string) => fakes.realms.get(`${universe} ${name}`);
  if (path.includes("qrender")) return realm(data.replace(/:.*$/, ""))?.page;
  if (path.includes("qfile")) return sourceOf(fakes, universe, data);
  const functions = path.includes("qfuncs") ? realm(data) : undefined;
  return functions === undefined ? undefined : JSON.stringify(functions.functions);
}

// A universe's node, as the chain package reads it: its status naming its chain, a held realm's page, source and functions.
function nodeAnswer(fakes: Held, chains: ReadonlyMap<string, string>, url: URL): unknown {
  const [, universe = "", route = ""] = /^\/node\/([a-z0-9-]+)\/(.*)$/.exec(url.pathname) ?? [];
  if (route === "status") return statusEnvelope(fakes.at.height, TIME, chains.get(universe));
  const data = dataOf(fakes, universe, { path: url.searchParams.get("path") ?? "", data: fromHex(url) });
  return data === undefined ? REFUSED() : queryEnvelope({ data });
}

// A universe's node as gnomcp reads it: tm2's HTTP client posts one JSON-RPC call to the node's root (gno v1.5.0,
// rpc/lib/client/http/client.go:128), each param in amino's JSON, a query's data in base64 (lib/types/types.go:121),
// and reads the answer by the call's id.
function rpcAnswer(fakes: Held, { universe, chain }: { universe: string; chain: string | undefined }, text: string) {
  const Call = z.object({
    id: z.union([z.string(), z.number()]),
    method: z.string(),
    params: z.object({ path: z.string().optional(), data: z.string().optional() }).optional(),
  });
  const call = Call.safeParse(jsonOf(text));
  if (!call.success) return { jsonrpc: "2.0", id: "", error: { code: -32600, message: "Invalid request" } };
  const { id, method, params } = call.data;
  if (method === "status") return { ...statusEnvelope(fakes.at.height, TIME, chain), id };
  if (method !== "abci_query") return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } };
  const data = Buffer.from(params?.data ?? "", "base64").toString();
  const answer = dataOf(fakes, universe, { path: params?.path ?? "", data });
  return { ...(answer === undefined ? REFUSED() : queryEnvelope({ data: answer })), id };
}

// A batch of jarvis's spans: JSON by its type and its text, under the cap.
function traced(fakes: Held, request: IncomingMessage, text: string): number {
  if (!/^application\/json(;|$)/i.test(request.headers["content-type"] ?? "")) return 415;
  if (fakes.batches.length >= BATCHES) return 413;
  const batch = jsonOf(text);
  if (batch === undefined) return 400;
  fakes.batches.push(batch);
  return 200;
}

// A loopback server answering `answer`, a request that names another Host refused.
async function hosted(answer: (request: IncomingMessage, response: ServerResponse) => Promise<void>) {
  let own = "";
  const served = await onLoopback(async (request, response) => {
    if (request.headers.host === own) await answer(request, response);
    else reply(response, 421);
  });
  own = new URL(served.origin).host;
  return served;
}

/** The loopback servers of a run, listening, for these universes (their ids and chains): jarvis's own test server, and
 * one for each universe's node as gnomcp reads it, whose URL can hold no path (tm2's client turns its slashes to dots,
 * client.go:207). */
export async function startFakes(universes: readonly { id: string; chainId: string }[]): Promise<Fakes> {
  const chains = new Map(universes.map((one) => [one.id, one.chainId]));
  const held: Held = { realms: new Map(), batches: [], at: { height: 1 }, served: [] };
  const { origin, close } = await hosted(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://fake");
    const text = await bodyOf(request);
    if (url.pathname === "/v1/traces") reply(response, traced(held, request, text));
    else reply(response, 200, nodeAnswer(held, chains, url));
  });
  const nodes = await Promise.all(
    universes.map(async ({ id, chainId }) => {
      const node = await hosted(async (request, response) => {
        reply(response, 200, rpcAnswer(held, { universe: id, chain: chainId }, await bodyOf(request)));
      });
      return { id, ...node };
    }),
  );
  const rpcs = new Map(nodes.map((node) => [node.id, node.origin]));
  const closed = async () => {
    await Promise.all([close(), ...nodes.map((node) => node.close())]);
  };
  return { ...held, origin, rpcs, close: closed };
}
