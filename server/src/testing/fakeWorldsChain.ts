// A chain and its indexer as the worlds job's tests build them (slice 7, 7c): one `send` that answers the RPC's abci_query reads
// (vm/qpaths, vm/qdoc, vm/qfile, vm/qeval) and the indexer's GraphQL POST, each from a function the test gives, and records what
// was asked and how many requests were in flight at once. The envelope of an abci_query is QueryAnswer's (packages/schemas/src/chain.ts).
type Send = (url: string, init: RequestInit, ms: number) => Promise<Response>;

/** What a route gives: a text (the Data of a good abci_query, or the body of an indexer answer), a Response, or a fault. */
type Given = string | Response | Error;

interface Asked {
  /** `vm/qpaths`, `vm/qdoc`, `vm/qfile`, `vm/qeval`, or `indexer`. */
  readonly kind: string;
  /** The abci_query's data decoded from hex, or the GraphQL request's parsed JSON body. */
  readonly data: string;
  readonly url: string;
  readonly init: RequestInit;
  readonly ms: number;
}

export interface Routes {
  paths?: ((data: string) => Given) | undefined;
  doc?: ((path: string) => Given) | undefined;
  file?: ((path: string) => Given) | undefined;
  eval?: ((expression: string) => Given) | undefined;
  /** The indexer's answer to one GraphQL request (its `query` and `variables` parsed). */
  indexer?: ((request: { query: string; variables: Record<string, unknown> }) => Given) | undefined;
}

export interface FakeChain {
  send: Send;
  asked: Asked[];
  /** The most requests in flight at once. */
  readonly parallel: () => number;
}

export const RPC = "https://rpc.onyx.testnets.gno.land:443";
export const INDEXER = "https://indexer.onyx.testnets.gno.land/graphql/query";

const base64 = (text: string): string => Buffer.from(text, "utf8").toString("base64");

/** A good abci_query answer carrying `text`. */
const abci = (text: string): Response =>
  Response.json({ result: { response: { ResponseBase: { Error: null, Data: base64(text) } } } });

/** An abci_query the chain refused, with the type of its error. */
export const abciRefused = (type = "/vm.InvalidPkgPathError"): Response =>
  Response.json({ result: { response: { ResponseBase: { Error: { "@type": type }, Data: null } } } });

const asResponse = (given: Given, plain: (text: string) => Response): Response | Error =>
  typeof given === "string" ? plain(given) : given;

export function fakeChain(
  routes: Routes,
  options: { rpc?: string; indexer?: string; delayMs?: number } = {},
): FakeChain {
  const { rpc = RPC, indexer = INDEXER, delayMs = 0 } = options;
  const asked: Asked[] = [];
  let running = 0;
  let most = 0;

  const indexerAnswer = (url: string, init: RequestInit, ms: number): Response | Error => {
    const text = typeof init.body === "string" ? init.body : "{}";
    const body = JSON.parse(text) as { query: string; variables?: Record<string, unknown> };
    asked.push({ kind: "indexer", data: JSON.stringify(body), url, init, ms });
    const given = routes.indexer?.({ query: body.query, variables: body.variables ?? {} });
    return given === undefined ? new Response("not found", { status: 404 }) : asResponse(given, (t) => new Response(t));
  };

  const rpcAnswer = (url: string, init: RequestInit, ms: number): Response | Error => {
    const parsed = new URL(url);
    // The path is quoted and may carry a query (`"vm/qpaths?limit=10"`): the kind is what comes before it.
    const kind = (parsed.searchParams.get("path") ?? "").replaceAll('"', "").split("?")[0] ?? "";
    const hex = (parsed.searchParams.get("data") ?? "").replace(/^0x/, "");
    const data = Buffer.from(hex, "hex").toString("utf8");
    asked.push({ kind, data, url, init, ms });
    if (!url.startsWith(rpc.replace(/:443$/, "")) || parsed.pathname !== "/abci_query")
      return new Response("no", { status: 404 });
    const byKind: Record<string, ((data: string) => Given) | undefined> = {
      "vm/qpaths": routes.paths,
      "vm/qdoc": routes.doc,
      "vm/qfile": routes.file,
      "vm/qeval": routes.eval,
    };
    const given = byKind[kind]?.(data);
    return given === undefined ? abciRefused() : asResponse(given, abci);
  };

  const answer = (url: string, init: RequestInit, ms: number): Response | Error =>
    url.startsWith(indexer) ? indexerAnswer(url, init, ms) : rpcAnswer(url, init, ms);

  const send: Send = async (url, init, ms) => {
    running += 1;
    most = Math.max(most, running);
    try {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      const given = answer(url, init, ms);
      if (given instanceof Error) throw given;
      return given;
    } finally {
      running -= 1;
    }
  };

  return { send, asked, parallel: () => most };
}
