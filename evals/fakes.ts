// An eval run's recorded node and spans' receiver, on one loopback server (provider.ts): a realm by its universe and
// path, at the height its case recorded; jarvis's span batches, JSON alone. It answers a request naming its own
// loopback Host alone, as a page another site's DNS steers here names another (10j's review, S6).
import type { IncomingMessage, ServerResponse } from "node:http";
import { bodyOf, onLoopback } from "../jarvis/src/testing/loopback.ts";
import { queryEnvelope, statusEnvelope } from "../packages/chain/src/testing/envelopes.ts";
import { jsonOf } from "../packages/core/src/json/json.ts";
import type { Chain } from "./cases.ts";

// The most span batches a run keeps: a case's take a few, so a flood of forged ones stops here.
const BATCHES = 10_000;

interface Held {
  realms: Map<string, Chain>;
  batches: unknown[];
  // The height the node's status names: the last realm's recorded, as one case runs at a time.
  at: { height: number };
}
export interface Fakes extends Held {
  origin: string;
  close: () => Promise<void>;
}

const reply = (response: ServerResponse, status: number, body: unknown = {}): void => {
  response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
};
const fromHex = (url: URL) => Buffer.from((url.searchParams.get("data") ?? "").replace(/^0x/, ""), "hex").toString();
const REFUSED = () => queryEnvelope({ data: null, error: { "@type": "/vm.InvalidPkgPathError" } });

// A realm's recorded source for a file query naming the realm's path, or a file under it.
// ponytail: gno_read's query shape (vm/qfile, the realm's path, a file under it) is not read live yet; the first run with the key says.
const sourceOf = (fakes: Held, data: string): string | undefined =>
  [...fakes.realms].find(([name]) => data.startsWith(name.split(" ")[1] ?? "\0"))?.[1].source;

// What a query of a universe's node holds: a realm's page (vm/qrender), its source (vm/qfile) or its functions (vm/qfuncs).
function dataOf(fakes: Held, universe: string, { path, data }: { path: string; data: string }): string | undefined {
  const realm = (name: string) => fakes.realms.get(`${universe} ${name}`);
  if (path.includes("qrender")) return realm(data.replace(/:.*$/, ""))?.page;
  if (path.includes("qfile")) return sourceOf(fakes, data);
  const functions = path.includes("qfuncs") ? realm(data) : undefined;
  return functions === undefined ? undefined : JSON.stringify(functions.functions);
}

// A universe's node, as the chain package reads it: its status naming its chain, a held realm's page, source and functions.
function nodeAnswer(fakes: Held, chains: ReadonlyMap<string, string>, url: URL): unknown {
  const [, universe = "", route = ""] = /^\/node\/([a-z0-9-]+)\/(.*)$/.exec(url.pathname) ?? [];
  if (route === "status") return statusEnvelope(fakes.at.height, "2026-11-05T00:00:00Z", chains.get(universe));
  const data = dataOf(fakes, universe, { path: url.searchParams.get("path") ?? "", data: fromHex(url) });
  return data === undefined ? REFUSED() : queryEnvelope({ data });
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

/** The loopback server of a run, listening, for these universes (their ids and chains): jarvis's own test server. */
export async function startFakes(universes: readonly { id: string; chainId: string }[]): Promise<Fakes> {
  const chains = new Map(universes.map((one) => [one.id, one.chainId]));
  const held: Held = { realms: new Map(), batches: [], at: { height: 1 } };
  let own = "";
  const { origin, close } = await onLoopback(async (request: IncomingMessage, response: ServerResponse) => {
    if (request.headers.host !== own) {
      reply(response, 421);
      return;
    }
    const url = new URL(request.url ?? "/", "http://fake");
    const text = await bodyOf(request);
    if (url.pathname === "/v1/traces") reply(response, traced(held, request, text));
    else reply(response, 200, nodeAnswer(held, chains, url));
  });
  own = new URL(origin).host;
  return { ...held, origin, close };
}
