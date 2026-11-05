import fc from "fast-check";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANY_EXPRESSION_RUNS,
  EVALS,
  FUNCTIONS,
  PAGES,
  REFUSALS,
  STATUS,
  WUGNOT,
} from "../../../tests/chain/chainFixture.ts";
import { queryEnvelope, rpcErrorEnvelope, statusEnvelope } from "@gnoworld/chain/testing/envelopes";
import { evalCall } from "./evalCall.ts";
import type { ChainFetch, ChainRead, Failure, ReadOptions } from "@gnoworld/chain/read";
import { readHeight } from "@gnoworld/chain/node";
import { readCallable, readEval, readFunctions, readPage, readUser } from "./rpc.ts";

// 5g-reads: the four reads of a chain (vm/qrender, vm/qeval, vm/qfuncs, the block height), through read.ts. chainFixture.ts says
// which answers are RECORDED through gnomcp and which are READ from gno's source at v1.5.0; a title says "recorded" or "read".
// The chains run newer code than that source: no test here proves what a browser receives.
const RPC = {
  "onyx-1": "https://rpc.onyx.testnets.gno.land:443",
  "gnoland-1": "https://rpc.gno.land:443",
} as const;
type ChainId = keyof typeof RPC;
const CHAINS = Object.keys(RPC) as ChainId[];
const NOW = new Date("2026-10-31T06:00:00.000Z");
const HOSTILE = "<script>alert('HOSTILE')</script>\u0000\u202e HOSTILE";

const hexOf = (text: string): string =>
  Array.from(new TextEncoder().encode(text), (byte) => byte.toString(16).padStart(2, "0")).join("");
const queryUrl = (rpc: string, query: string, data: string): string =>
  `${rpc}/abci_query?path=%22${query.replace("/", "%2F")}%22&data=0x${hexOf(data)}`;

/** A fetch that answers every request with this JSON. */
const answering = (body: unknown, init?: ResponseInit) =>
  vi.fn<ChainFetch>(() => Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), init)));
const options = (fetcher: ChainFetch, extra: ReadOptions = {}): ReadOptions => ({
  fetch: fetcher,
  now: () => NOW,
  ...extra,
});
const askedOf = (fetcher: ReturnType<typeof answering>): string[] => fetcher.mock.calls.map(([url]) => url);

function failureOf(result: ChainRead<unknown>): Failure {
  if (result.ok) throw new Error("expected a failure");
  expect(result.failure.next).toMatch(/\S/);
  return result.failure;
}
function valueOf<T>(result: ChainRead<T>): T {
  if (!result.ok) throw new Error(`expected a value, got ${result.failure.kind}`);
  return result.value;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the universes' RPC addresses", () => {
  it("are the ones these tests read, from app/data/universes.json", () => {
    const text = readFileSync(new URL("../../../data/universes.json", import.meta.url), "utf8");
    for (const rpc of Object.values(RPC)) expect(text).toContain(`"${rpc}"`);
  });
});

describe.each(CHAINS)("the reads on %s", (chain) => {
  const rpc = RPC[chain];

  describe("readHeight (recorded: the height and time gnomcp gave; read: the /status envelope)", () => {
    it.each(STATUS[chain])("gives block $height at $time, with its source", async ({ height, time }) => {
      const fetcher = answering(statusEnvelope(height, time));
      const result = await readHeight(rpc, { ...options(fetcher), chainId: null });
      expect(result).toEqual({
        ok: true,
        value: { height, time },
        source: { url: `${rpc}/status`, at: NOW.toISOString() },
      });
      expect(askedOf(fetcher)).toEqual([`${rpc}/status`]);
    });
  });

  describe("readPage (recorded: the text of each page)", () => {
    it.each(PAGES.filter((row) => row.chain === chain))(
      "gives $realm:$path exactly as the chain wrote it",
      async (row) => {
        const fetcher = answering(queryEnvelope({ data: row.body }));
        const result = await readPage(rpc, { realm: row.realm, path: row.path }, options(fetcher));
        const url = queryUrl(rpc, "vm/qrender", `${row.realm}:${row.path}`);
        expect(result).toEqual({ ok: true, value: row.body, source: { url, at: NOW.toISOString() } });
        expect(askedOf(fetcher)).toEqual([url]);
      },
    );
  });

  describe("readEval (recorded: the typed text of each call)", () => {
    const plain = EVALS.filter((row) => row.chain === chain && /^[A-Z]\w*\(\)$/.test(row.expr));
    it("has rows to run", () => {
      expect(plain.length).toBeGreaterThan(0);
    });
    it.each(plain)("gives $realm.$expr as the typed text", async (row) => {
      const fetcher = answering(queryEnvelope({ data: row.body }));
      const result = await readEval(rpc, { realm: row.realm, name: row.expr.slice(0, -2) }, options(fetcher));
      const url = queryUrl(rpc, "vm/qeval", `${row.realm}.${row.expr}`);
      expect(result).toEqual({ ok: true, value: row.body, source: { url, at: NOW.toISOString() } });
      expect(askedOf(fetcher)).toEqual([url]);
    });
  });

  describe("readFunctions (read: FUNCTIONS is written from source, not recorded)", () => {
    it("gives every name of wugnot in order, and TotalSupply is the one readable function", async () => {
      const fetcher = answering(queryEnvelope({ data: JSON.stringify(FUNCTIONS) }));
      const result = await readFunctions(rpc, WUGNOT, options(fetcher));
      const url = queryUrl(rpc, "vm/qfuncs", WUGNOT);
      expect(result).toEqual({
        ok: true,
        value: FUNCTIONS.map(({ FuncName }) => ({ name: FuncName, readable: FuncName === "TotalSupply" })),
        source: { url, at: NOW.toISOString() },
      });
      expect(askedOf(fetcher)).toEqual([url]);
    });
  });

  describe("readCallable (read: FUNCTIONS is written from source, not recorded)", () => {
    it("gives every exported name with its parameters in order, one request, and none for a name that is no realm's", async () => {
      const fetcher = answering(queryEnvelope({ data: JSON.stringify(FUNCTIONS) }));
      const result = await readCallable(rpc, WUGNOT, options(fetcher));
      expect(result.ok ? result.value.map(({ name }) => name) : []).toEqual(FUNCTIONS.map(({ FuncName }) => FuncName));
      expect(result.ok ? result.value[0]?.params : undefined).toEqual(
        (FUNCTIONS[0]?.Params ?? []).map(({ Name, Type }) => ({ Name, Type })),
      );
      expect(askedOf(fetcher)).toEqual([queryUrl(rpc, "vm/qfuncs", WUGNOT)]);
      expect(await readCallable(rpc, "../x", options(fetcher))).toMatchObject({
        ok: false,
        failure: { kind: "bad-name" },
      });
      expect(askedOf(fetcher)).toHaveLength(1);
    });
  });

  describe("readCallable, a function with no parameters", () => {
    it("gives an empty list for it, as the chain writes it with none", async () => {
      const fetcher = answering(
        queryEnvelope({ data: JSON.stringify([{ FuncName: "Ping", Params: null, Results: null }]) }),
      );
      const result = await readCallable(rpc, WUGNOT, options(fetcher));
      expect(result.ok ? result.value : undefined).toEqual([{ name: "Ping", params: [] }]);
    });
  });

  describe("two panels of one view asking for a realm's functions in the same moment", () => {
    it("share one request when they ask with the same options, and a read that has ended is asked again", async () => {
      const fetcher = answering(queryEnvelope({ data: JSON.stringify(FUNCTIONS) }));
      const shared = options(fetcher);
      const [names, params] = await Promise.all([
        readFunctions(rpc, WUGNOT, shared),
        readCallable(rpc, WUGNOT, shared),
      ]);
      expect([names.ok, params.ok]).toEqual([true, true]);
      expect(askedOf(fetcher)).toHaveLength(1);
      await readFunctions(rpc, WUGNOT, shared);
      expect(askedOf(fetcher)).toHaveLength(2);
    });

    it("do not share one with options of another read, nor across two realms", async () => {
      const fetcher = answering(queryEnvelope({ data: JSON.stringify(FUNCTIONS) }));
      await Promise.all([
        readFunctions(rpc, WUGNOT, options(fetcher)),
        readFunctions(rpc, WUGNOT, options(fetcher)),
        readFunctions(rpc, "gno.land/r/demo/other", options(fetcher)),
      ]);
      expect(askedOf(fetcher)).toHaveLength(3);
    });

    it("share one request when no options are given, as the page asks", async () => {
      const fetcher = answering(queryEnvelope({ data: JSON.stringify(FUNCTIONS) }));
      vi.stubGlobal("fetch", fetcher);
      await Promise.all([readFunctions(rpc, WUGNOT), readCallable(rpc, WUGNOT)]);
      expect(askedOf(fetcher)).toHaveLength(1);
      vi.unstubAllGlobals();
    });
  });

  describe("the refusals (recorded: gnomcp's text and the @type gno's source gives it; read: the envelope)", () => {
    const KIND: Record<string, string> = {
      "/vm.InvalidPkgPathError": "no-realm",
      "/vm.NoRenderDeclError": "no-page",
      "/abci.StringError": "chain-refused",
    };
    // A row that is no plain call is never asked: evalCall.test.ts and the bad-name tests hold that.
    const rows = REFUSALS.filter(
      (row) => row.chain === chain && (row.query === "vm/qrender" || /\.[A-Z]\w*\(\)$/.test(row.data)),
    );
    it.each(rows)("$query of $data is $error", async (row) => {
      const stringError = row.error === "/abci.StringError";
      const fetcher = answering(
        queryEnvelope({ data: null, error: { "@type": row.error, ...(stringError ? { value: row.text } : {}) } }),
      );
      let result: ChainRead<unknown>;
      if (row.query === "vm/qrender") {
        const colon = row.data.indexOf(":");
        result = await readPage(
          rpc,
          { realm: row.data.slice(0, colon), path: row.data.slice(colon + 1) },
          options(fetcher),
        );
      } else {
        const at = row.data.lastIndexOf(".");
        result = await readEval(
          rpc,
          { realm: row.data.slice(0, at), name: row.data.slice(at + 1, -2) },
          options(fetcher),
        );
      }
      expect(failureOf(result).kind).toBe(KIND[row.error]);
      expect(askedOf(fetcher)).toEqual([queryUrl(rpc, row.query, row.data)]);
      expect(JSON.stringify(result)).not.toContain(row.text);
    });
  });
});

describe("what a failure says", () => {
  it.each([
    ["no-realm", "/vm.InvalidPkgPathError", "This realm is not on this chain. Check its path."],
    ["no-page", "/vm.NoRenderDeclError", "This realm has no page to show. Open it on gnoweb."],
    ["chain-refused", "/abci.StringError", "The chain refused this read. Try again later, or open it on gnoweb."],
  ])("%s has its sentence", async (kind, error, next) => {
    const fetcher = answering(queryEnvelope({ data: null, error: { "@type": error } }));
    const failure = failureOf(await readPage(RPC["gnoland-1"], { realm: WUGNOT, path: "" }, options(fetcher)));
    expect(failure.kind).toBe(kind);
    expect(failure.next).toBe(next);
  });

  it("bad-name has its sentence, and nothing is asked", async () => {
    const fetcher = answering("{}");
    const failure = failureOf(await readPage(RPC["gnoland-1"], { realm: "not a realm", path: "" }, options(fetcher)));
    expect(failure).toMatchObject({ kind: "bad-name", next: "This name cannot be read from here. Open it on gnoweb." });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("an unknown @type of Error is chain-refused", async () => {
    const fetcher = answering(queryEnvelope({ data: null, error: { "@type": "/vm.SomethingNewError" } }));
    expect(failureOf(await readPage(RPC["gnoland-1"], { realm: WUGNOT, path: "" }, options(fetcher))).kind).toBe(
      "chain-refused",
    );
  });

  it("a JSON-RPC error (HTTP 200, no result: handlers.go:393,413) is chain-refused", async () => {
    const fetcher = answering(rpcErrorEnvelope("bad parameter"));
    const failure = failureOf(await readPage(RPC["gnoland-1"], { realm: WUGNOT, path: "" }, options(fetcher)));
    expect(failure.kind).toBe("chain-refused");
    expect(JSON.stringify(failure)).not.toContain("bad parameter");
  });
});

// Each read, with an answer it takes and the call that makes it.
const READS = [
  {
    name: "readHeight",
    good: () => statusEnvelope(10, "2026-10-30T23:43:10Z"),
    run: (rpc: string, o: ReadOptions) => readHeight(rpc, { ...o, chainId: null }),
    onRpcError: "wrong-shape",
  },
  {
    name: "readPage",
    good: () => queryEnvelope({ data: "# hello" }),
    run: (rpc: string, o: ReadOptions) => readPage(rpc, { realm: WUGNOT, path: "" }, o),
    onRpcError: "chain-refused",
  },
  {
    name: "readEval",
    good: () => queryEnvelope({ data: "(1 int64)" }),
    run: (rpc: string, o: ReadOptions) => readEval(rpc, { realm: WUGNOT, name: "TotalSupply" }, o),
    onRpcError: "chain-refused",
  },
  {
    name: "readFunctions",
    good: () => queryEnvelope({ data: JSON.stringify(FUNCTIONS) }),
    run: (rpc: string, o: ReadOptions) => readFunctions(rpc, WUGNOT, o),
    onRpcError: "chain-refused",
  },
];
const ABCI = READS.filter((read) => read.name !== "readHeight");
const RPC_OK = RPC["gnoland-1"];

describe.each(READS)("$name, the read and its failures", ({ good, run, onRpcError }) => {
  it("is a sound read with one request, no timer left and a source", async () => {
    const fetcher = answering(good());
    const result = await run(RPC_OK, options(fetcher));
    expect(result.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.source.url).toMatch(/^https:\/\/rpc\.gno\.land:443\//);
    expect(result.source.at).toBe(NOW.toISOString());
    expect(vi.getTimerCount()).toBe(0);
  });

  it("asks with a GET for JSON, from no cache", async () => {
    const fetcher = answering(good());
    await run(RPC_OK, options(fetcher));
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      cache: "no-store",
      headers: { accept: "application/json" },
    });
  });

  it("is down when fetch rejects, and asks once", async () => {
    const fetcher = vi.fn<ChainFetch>(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(failureOf(await run(RPC_OK, options(fetcher))).kind).toBe("down");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is down on HTTP 503, keeping the status", async () => {
    const failure = failureOf(await run(RPC_OK, options(answering("busy", { status: 503 }))));
    expect(failure).toMatchObject({ kind: "down", status: 503 });
  });

  it("is a timeout when the chain never answers, with no timer left", async () => {
    const fetcher = vi.fn<ChainFetch>(() => new Promise<Response>(() => undefined));
    const pending = run(RPC_OK, options(fetcher));
    await vi.advanceTimersByTimeAsync(8_000);
    expect(failureOf(await pending).kind).toBe("timeout");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("takes the time limit it is given", async () => {
    const fetcher = vi.fn<ChainFetch>(() => new Promise<Response>(() => undefined));
    const pending = run(RPC_OK, options(fetcher, { timeoutMs: 50 }));
    await vi.advanceTimersByTimeAsync(50);
    expect(failureOf(await pending).kind).toBe("timeout");
  });

  it("is too big past the default cap, a failure with no status when nothing refused it", async () => {
    const huge = answering(JSON.stringify({ ...good(), pad: "a".repeat(1_100_000) }));
    const failure = failureOf(await run(RPC_OK, options(huge)));
    expect(failure.kind).toBe("too-big");
    expect(failure).not.toHaveProperty("status");
  });

  it("is too big past a cap it is given", async () => {
    const small = answering(good());
    expect(failureOf(await run(RPC_OK, options(small, { maxBytes: 10 }))).kind).toBe("too-big");
  });

  it.each([
    ["HTML", "<html>busy</html>"],
    ["nothing", ""],
    ["a half of a JSON", '{"jsonrpc":"2.0",'],
  ])("is not-json on %s", async (_name, body) => {
    expect(failureOf(await run(RPC_OK, options(answering(body)))).kind).toBe("not-json");
  });

  it.each([
    ["an empty list", []],
    ["null", null],
    ["a string", '"hello"'],
    ["neither a result nor an error", { jsonrpc: "2.0", id: "" }],
    ["a result of another shape", { jsonrpc: "2.0", id: "", result: { hello: 1 } }],
  ])("is a wrong shape on %s", async (_name, body) => {
    expect(failureOf(await run(RPC_OK, options(answering(body)))).kind).toBe("wrong-shape");
  });

  it("answers a JSON-RPC error (HTTP 200, error and no result: handlers.go:393) with its own kind", async () => {
    const result = await run(RPC_OK, options(answering(rpcErrorEnvelope("bad parameter"))));
    expect(failureOf(result).kind).toBe(onRpcError);
    expect(JSON.stringify(result)).not.toContain("bad parameter");
  });

  // read.ts's promise: a result, good or not, names where it was read and when.
  it.each([
    ["a rejected fetch", () => vi.fn<ChainFetch>(() => Promise.reject(new TypeError("Failed to fetch")))],
    ["HTTP 503", () => answering("busy", { status: 503 })],
    ["an answer past the cap", () => answering(JSON.stringify({ ...good(), pad: "a".repeat(1_100_000) }))],
    ["something that is no JSON", () => answering("<html>busy</html>")],
    ["a wrong shape", () => answering({ jsonrpc: "2.0", id: "", result: { hello: 1 } })],
    ["a JSON-RPC error", () => answering(rpcErrorEnvelope("bad parameter"))],
  ])("names the address it asked and the time, on %s", async (_name, fetcherOf) => {
    const fetcher = fetcherOf();
    const result = await run(RPC_OK, options(fetcher));
    expect(result.ok).toBe(false);
    expect(askedOf(fetcher)).toHaveLength(1);
    expect(result.source).toEqual({ url: askedOf(fetcher)[0], at: NOW.toISOString() });
  });

  it("is refused, without a request, when the RPC is not https", async () => {
    const fetcher = answering(good());
    expect(failureOf(await run("http://rpc.gno.land:443", options(fetcher))).kind).toBe("refused");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("names the address it refused and the time", async () => {
    const result = await run("http://rpc.gno.land:443", options(answering(good())));
    expect(result.source).toEqual({ url: "http://rpc.gno.land:443", at: NOW.toISOString() });
  });

  it("drops a trailing slash of the RPC address", async () => {
    const fetcher = answering(good());
    await run(`${RPC_OK}/`, options(fetcher));
    expect(askedOf(fetcher)[0]).not.toContain("//status");
    expect(askedOf(fetcher)[0]).not.toContain("//abci_query");
    expect(askedOf(fetcher)[0]).toMatch(/^https:\/\/rpc\.gno\.land:443\/(status|abci_query\?)/);
  });

  it.each([
    "",
    "not a url",
    "https://",
    "ftp://x",
    "https://user:pw@rpc.example.org",
    "https://user@rpc.example.org",
    "https://:pw@rpc.example.org",
  ])("never throws, and asks nothing, for the RPC address %j", async (rpc) => {
    const fetcher = answering(good());
    expect((await run(rpc, options(fetcher))).ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe.each(ABCI)("$name, the answer inside the envelope", ({ run }) => {
  const read = (data: string | null, extra?: Parameters<typeof queryEnvelope>[0]["error"]) =>
    run(RPC_OK, options(answering(queryEnvelope({ data, ...(extra ? { error: extra } : {}) }))));

  it("is a wrong shape when Data is not base64", async () => {
    const body = queryEnvelope({ data: "x" });
    body.result.response.ResponseBase.Data = "!!! not base64 !!!";
    expect(failureOf(await run(RPC_OK, options(answering(body)))).kind).toBe("wrong-shape");
  });

  it("is a wrong shape when the bytes are no UTF-8 (the same fatal decoder as read.ts)", async () => {
    const body = queryEnvelope({ data: "x" });
    body.result.response.ResponseBase.Data = btoa("\xff\xfe\xfd");
    expect(failureOf(await run(RPC_OK, options(answering(body)))).kind).toBe("wrong-shape");
  });

  it("fails on a page too big in base64 even if its text would pass the cap", async () => {
    const fetcher = answering(queryEnvelope({ data: "a".repeat(800_000) }));
    expect(failureOf(await run(RPC_OK, options(fetcher))).kind).toBe("too-big");
  });

  it("keeps a refused read's text out of the failure: Error.value, Log, and a JSON-RPC message", async () => {
    const refused = queryEnvelope({
      data: null,
      error: { "@type": "/abci.StringError", value: HOSTILE },
      log: HOSTILE,
    });
    const failure = failureOf(await run(RPC_OK, options(answering(refused))));
    expect(JSON.stringify(failure)).not.toContain("HOSTILE");
    const rpcError = failureOf(await run(RPC_OK, options(answering(rpcErrorEnvelope(HOSTILE)))));
    expect(JSON.stringify(rpcError)).not.toContain("HOSTILE");
  });

  it("does not let Log or Info reach a good value", async () => {
    const body = queryEnvelope({ data: "[]", log: HOSTILE });
    body.result.response.ResponseBase.Info = HOSTILE;
    const result = await run(RPC_OK, options(answering(body)));
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain("HOSTILE");
  });

  it.each([
    ["a refusal", queryEnvelope({ data: null, error: { "@type": "/vm.InvalidPkgPathError" } })],
    ["no Data", queryEnvelope({ data: null })],
  ])("names the address it asked and the time, on %s inside the envelope", async (_name, body) => {
    const fetcher = answering(body);
    const result = await run(RPC_OK, options(fetcher));
    expect(result.ok).toBe(false);
    expect(askedOf(fetcher)).toHaveLength(1);
    expect(result.source).toEqual({ url: askedOf(fetcher)[0], at: NOW.toISOString() });
  });

  it("is a good answer with no Error key, and a wrong shape with neither key", async () => {
    const body = (ResponseBase: object) => ({ result: { response: { ResponseBase } } });
    expect((await run(RPC_OK, options(answering(body({ Data: btoa("[]") }))))).ok).toBe(true);
    expect(failureOf(await run(RPC_OK, options(answering(body({}))))).kind).toBe("wrong-shape");
  });

  it("is chain-refused, not a value, when Data is null with an Error", async () => {
    const result = await read(null, { "@type": "/abci.StringError", value: "boom" });
    expect(failureOf(result).kind).toBe("chain-refused");
  });

  it("is a wrong shape, not an empty value, when Data is null and there is no Error: an empty page is the empty string", async () => {
    expect(failureOf(await read(null)).kind).toBe("wrong-shape");
  });

  it("is chain-refused, not a value, when Data is present together with an Error", async () => {
    const body = queryEnvelope({ data: "# hello", error: { "@type": "/abci.StringError", value: "boom" } });
    expect(failureOf(await run(RPC_OK, options(answering(body)))).kind).toBe("chain-refused");
  });
});

// No recording exercises a GET (gno's clients POST), so these are spelled by hand from handlers.go:432-484, no copy of rpc.ts.
describe("the request, spelled out", () => {
  const demo = "gno.land/r/demo";
  const abci = `${RPC_OK}/abci_query`;

  it.each([
    [
      `${abci}?path=%22vm%2Fqrender%22&data=0x676e6f2e6c616e642f722f64656d6f3a78`,
      (o: ReadOptions) => readPage(RPC_OK, { realm: demo, path: "x" }, o),
    ],
    [
      `${abci}?path=%22vm%2Fqeval%22&data=0x676e6f2e6c616e642f722f64656d6f2e412829`,
      (o: ReadOptions) => readEval(RPC_OK, { realm: demo, name: "A" }, o),
    ],
    [
      `${abci}?path=%22vm%2Fqfuncs%22&data=0x676e6f2e6c616e642f722f64656d6f`,
      (o: ReadOptions) => readFunctions(RPC_OK, demo, o),
    ],
  ])("asks %s", async (url, run) => {
    const fetcher = answering(queryEnvelope({ data: "null" }));
    expect((await run(options(fetcher))).ok).toBe(true);
    expect(askedOf(fetcher)).toEqual([url]);
  });
});

describe("a read that asked nothing", () => {
  const LATER = new Date("2026-10-31T07:00:00.000Z");

  it.each([
    ["readPage", (o: ReadOptions) => readPage(RPC_OK, { realm: "not a realm" }, o)],
    ["readFunctions", (o: ReadOptions) => readFunctions(RPC_OK, "not a realm", o)],
    ["readEval", (o: ReadOptions) => readEval(RPC_OK, { realm: WUGNOT, name: "not a name" }, o)],
  ])("%s still names the RPC and the time, of its clock or the system's", async (_name, run) => {
    expect((await run({ now: () => NOW })).source).toEqual({ url: RPC_OK, at: NOW.toISOString() });
    vi.setSystemTime(LATER);
    expect((await run({})).source).toEqual({ url: RPC_OK, at: LATER.toISOString() });
  });
});

describe("a very long name", () => {
  const long = `gno.land/r/${"a_".repeat(100_000)}!`;

  it.each([
    ["readPage", (o: ReadOptions) => readPage(RPC_OK, { realm: long, path: "" }, o)],
    ["readFunctions", (o: ReadOptions) => readFunctions(RPC_OK, long, o)],
    ["readEval", (o: ReadOptions) => readEval(RPC_OK, { realm: long, name: "TotalSupply" }, o)],
  ])("%s refuses a 200 KB near-valid realm path as bad-name, and asks nothing", async (_name, run) => {
    const fetcher = answering("{}");
    expect(failureOf(await run(options(fetcher))).kind).toBe("bad-name");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("readPage", () => {
  const page = (body: string, path?: string, realm = WUGNOT) => {
    const fetcher = answering(queryEnvelope({ data: body }));
    return { fetcher, result: readPage(RPC_OK, path === undefined ? { realm } : { realm, path }, options(fetcher)) };
  };

  it("asks for the home page when no path is given: <realm>: and nothing after the colon", async () => {
    const { fetcher, result } = page("# home");
    expect(valueOf(await result)).toBe("# home");
    expect(askedOf(fetcher)).toEqual([queryUrl(RPC_OK, "vm/qrender", `${WUGNOT}:`)]);
  });

  it.each(["post/123", "a:b", "p/mainnet-upgrade", "é/🌍", "a b?c=d&e=f", "a\tb"])(
    "asks %j after the first colon, in hex, each byte in two digits",
    async (path) => {
      const { fetcher, result } = page("x", path);
      await result;
      expect(askedOf(fetcher)).toEqual([queryUrl(RPC_OK, "vm/qrender", `${WUGNOT}:${path}`)]);
    },
  );

  it("gives an empty page as a good answer: Data is the empty string", async () => {
    const { result } = page("");
    expect(valueOf(await result)).toBe("");
  });

  it("gives the text of a page without reading it: hostile markup, a NUL, a bidi mark, an emoji", async () => {
    const text = `${HOSTILE}\n<img src=x onerror=alert(1)>\n[a](javascript:alert(1)) héllo 🌍`;
    const { result } = page(text);
    expect(valueOf(await result)).toBe(text);
  });

  it.each([
    ["a dot past the first slash", "gno.land/r/demo/x.y"],
    ["a colon", "gno.land/r/demo:x"],
    ["a trailing newline", "gno.land/r/demo/x\n"],
    ["a name ending in _test", "gno.land/r/demo/foo_test"],
    ["empty", ""],
  ])("asks nothing and fails bad-name for a realm path with %s", async (_name, realm) => {
    const { fetcher, result } = page("x", "", realm);
    expect(failureOf(await result).kind).toBe("bad-name");
    expect(fetcher).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("readEval", () => {
  const ev = (name: string, realm = WUGNOT, body = "(1 int64)") => {
    const fetcher = answering(queryEnvelope({ data: body }));
    return { fetcher, result: readEval(RPC_OK, { realm, name }, options(fetcher)) };
  };

  it("asks the one call <realm>.<Name>() and gives the typed text", async () => {
    const { fetcher, result } = ev("TotalSupply");
    expect(valueOf(await result)).toBe("(1 int64)");
    expect(askedOf(fetcher)).toEqual([queryUrl(RPC_OK, "vm/qeval", `${WUGNOT}.TotalSupply()`)]);
  });

  it("gives a two-line result as the chain wrote it, one line a result (recorded)", async () => {
    const row = EVALS[3];
    const { result } = ev("ResolveName", row?.realm, row?.body);
    expect(valueOf(await result)).toBe(row?.body);
    expect(valueOf(await result).split("\n")).toHaveLength(2);
  });

  it("does not interpret a hostile result", async () => {
    const { result } = ev("TotalSupply", WUGNOT, `(${HOSTILE} string)`);
    expect(valueOf(await result)).toBe(`(${HOSTILE} string)`);
  });

  it("is the recorded expression that ran on the chain that evalCall refuses: it is never asked", async () => {
    const { fetcher, result } = ev(ANY_EXPRESSION_RUNS.expr);
    expect(failureOf(await result).kind).toBe("bad-name");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["an expression", ANY_EXPRESSION_RUNS.expr, WUGNOT],
    ["a call closed early", "Foo()); Bar(", WUGNOT],
    ["a selector", "Foo.Bar", WUGNOT],
    ["a leading underscore", "_helper", WUGNOT],
    ["a lower-case first letter", "foo", WUGNOT],
    ["a space", "A b", WUGNOT],
    ["a trailing newline", "A\n", WUGNOT],
    ["a full-width letter", "Ａ", WUGNOT],
    ["an empty name", "", WUGNOT],
    ["a bad realm", "TotalSupply", "gno.land/r/demo/x.y"],
    ["a realm that is an expression", "TotalSupply", `${WUGNOT}.TotalSupply()`],
  ])("asks nothing and fails bad-name for %s", async (_name, name, realm) => {
    const { fetcher, result } = ev(name, realm);
    expect(failureOf(await result).kind).toBe("bad-name");
    expect(fetcher).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a function that needs a crossing (Deposit) is refused by the chain: chain-refused, not a value (recorded)", async () => {
    const fetcher = answering(
      queryEnvelope({ data: null, error: { "@type": "/abci.StringError", value: "invalid non-origin call" } }),
    );
    const result = await readEval(RPC_OK, { realm: WUGNOT, name: "Deposit" }, options(fetcher));
    expect(failureOf(result).kind).toBe("chain-refused");
  });
});

describe("readHeight, the traps", () => {
  const at = (height: string, time = "2026-10-30T23:43:10Z") => {
    const body = statusEnvelope(1, time);
    body.result.sync_info.latest_block_height = height;
    return readHeight(RPC_OK, { ...options(answering(body)), chainId: null });
  };

  it("gives a height as a number and the block's own time", async () => {
    expect(valueOf(await at("1197968", "2026-10-30T23:51:39.123456789Z"))).toEqual({
      height: 1197968,
      time: "2026-10-30T23:51:39.123456789Z",
    });
  });

  it("takes the largest safe integer", async () => {
    expect(valueOf(await at(String(Number.MAX_SAFE_INTEGER))).height).toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each([String(Number.MAX_SAFE_INTEGER) + "0", "9007199254740992", "abc", "", "1.5", "-1", "0x10", " 12", "12 "])(
    "is a wrong shape for the height %j",
    async (height) => {
      expect(failureOf(await at(height)).kind).toBe("wrong-shape");
    },
  );

  it("is a wrong shape when the time is not a time", async () => {
    expect(failureOf(await at("12", "yesterday")).kind).toBe("wrong-shape");
  });

  it("names the address it asked and the time when the height is past a safe integer", async () => {
    const result = await at(String(Number.MAX_SAFE_INTEGER) + "0");
    expect(result.source).toEqual({ url: `${RPC_OK}/status`, at: NOW.toISOString() });
  });

  it("asks /status, not an abci_query: vm sets no Height, a page's height is its own read", async () => {
    const fetcher = answering(statusEnvelope(1, "2026-10-30T23:43:10Z"));
    await readHeight(RPC_OK, { ...options(fetcher), chainId: null });
    expect(askedOf(fetcher)).toEqual([`${RPC_OK}/status`]);
  });
});

describe("readFunctions, the traps", () => {
  const fn = (
    FuncName: string,
    Params: unknown = null,
    Results: unknown = [{ Name: ".res.0", Type: "int64", Value: "" }],
  ) => ({
    FuncName,
    Params,
    Results,
  });
  const list = (items: unknown) => {
    const fetcher = answering(queryEnvelope({ data: typeof items === "string" ? items : JSON.stringify(items) }));
    return { fetcher, result: readFunctions(RPC_OK, WUGNOT, options(fetcher)) };
  };

  it("gives an empty list for the text null: a realm with no exported function (keeper.go:1812)", async () => {
    expect(valueOf(await list("null").result)).toEqual([]);
  });

  it("gives an empty list for an empty list", async () => {
    expect(valueOf(await list([]).result)).toEqual([]);
  });

  it("reads Params null and Params [] alike: parameterless", async () => {
    const result = await list([fn("A", null), fn("B", [])]).result;
    expect(valueOf(result)).toEqual([
      { name: "A", readable: true },
      { name: "B", readable: true },
    ]);
  });

  it("reads Results null and [] alike: no result is a write, not readable", async () => {
    const result = await list([fn("A", null, null), fn("B", [], [])]).result;
    expect(valueOf(result)).toEqual([
      { name: "A", readable: false },
      { name: "B", readable: false },
    ]);
  });

  it("never strips cur: a crossing function with a result is not readable, only an empty Params is", async () => {
    const cur = { Name: "cur", Type: "realm", Value: "" };
    const result = await list([fn("Mint", [cur]), fn("Total", [])]).result;
    expect(valueOf(result)).toEqual([
      { name: "Mint", readable: false },
      { name: "Total", readable: true },
    ]);
  });

  it("leaves out each name that is not a plain exported identifier, and keeps the rest in order", async () => {
    const names = [
      "Good",
      "_helper",
      "1abc",
      "lower",
      "Foo()); Bar(",
      "A b",
      "A\n",
      "Ａ",
      "Foé",
      "",
      "Foo.Bar",
      HOSTILE,
      "Ok_1",
    ];
    const result = await list(names.map((name) => fn(name))).result;
    expect(valueOf(result).map(({ name }) => name)).toEqual(["Good", "Ok_1"]);
    expect(JSON.stringify(valueOf(result))).not.toContain("HOSTILE");
  });

  it.each([
    ["text that is no JSON", "not json at all"],
    ["an object", '{"FuncName":"A"}'],
    ["a number", "5"],
    ["a list of strings", '["A"]'],
    ["a function without its name", '[{"Params":null,"Results":null}]'],
    ["an empty text", ""],
  ])("is a wrong shape for %s", async (_name, text) => {
    expect(failureOf(await list(text).result).kind).toBe("wrong-shape");
  });

  it("asks nothing and is bad-name for a realm path with a dot past its first slash", async () => {
    const fetcher = answering(good());
    const result = await readFunctions(RPC_OK, "gno.land/r/demo/x.y", options(fetcher));
    expect(failureOf(result).kind).toBe("bad-name");
    expect(fetcher).not.toHaveBeenCalled();
  });

  function good() {
    return queryEnvelope({ data: "[]" });
  }

  describe("for any qfuncs answer", () => {
    // The plan's property: each call the names give parses, by gno's own cut, into the realm and one Name().
    const parse = (data: string) => {
      const slash = data.indexOf("/");
      const head = slash >= 0 ? data.slice(0, slash) : "";
      const rest = slash >= 0 ? data.slice(slash) : data;
      const dot = rest.indexOf(".");
      return dot < 0 ? null : { pkgPath: head + rest.slice(0, dot), expr: rest.slice(dot + 1) };
    };
    const name = fc.oneof(
      fc.string(),
      fc.constantFrom(
        "TotalSupply",
        "_helper",
        "Foo()); Bar(",
        "Foo.Bar",
        "A b",
        "A\n",
        "Ａ",
        "x",
        "Y9",
        "Z_",
        ANY_EXPRESSION_RUNS.expr,
      ),
    );
    const params = fc.constantFrom(null, [], [{ Name: "a", Type: "int", Value: "" }]);
    const results = fc.constantFrom(null, [], [{ Name: ".res.0", Type: "string", Value: "" }]);
    const entries = fc.uniqueArray(fc.record({ FuncName: name, Params: params, Results: results }), {
      selector: (entry) => entry.FuncName,
      maxLength: 12,
    });

    it("gives, for each name kept, a call that parses to the realm and one Name(); and keeps exactly the plain exported names", async () => {
      await fc.assert(
        fc.asyncProperty(entries, async (items) => {
          const value = valueOf(await list(items).result);
          const readable = ({ Params, Results }: (typeof items)[number]): boolean =>
            (Params === null || Params.length === 0) && Results !== null && Results.length > 0;
          const model = items
            .filter(({ FuncName }) => /^[A-Z][A-Za-z0-9_]*$/.test(FuncName))
            .map((item) => ({ name: item.FuncName, readable: readable(item) }));
          expect(value).toEqual(model);
          for (const { name } of value) {
            const call = evalCall(WUGNOT, name);
            expect(call).not.toBeNull();
            expect(parse(call ?? "")).toEqual({ pkgPath: WUGNOT, expr: `${name}()` });
          }
        }),
        { numRuns: 300 },
      );
    });
  });
});

describe("readUser, the one expression with an address in it", () => {
  const ADDRESS = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
  const expressionOf = (fetcher: ReturnType<typeof answering>): string => {
    const data = new URL(askedOf(fetcher)[0] ?? "").searchParams.get("data") ?? "";
    return new TextDecoder().decode(Uint8Array.from(data.slice(2).match(/../g) ?? [], (pair) => parseInt(pair, 16)));
  };

  it.each([
    'g1x"); os.Exit(1); ("',
    `${ADDRESS}")`,
    `${ADDRESS})`,
    `${ADDRESS}\n`,
    `${ADDRESS}\n.Name()`,
    `${ADDRESS}x`,
    `${ADDRESS} `,
    ADDRESS.toUpperCase(),
    "",
  ])("asks nothing for %j: only an address the schema proves is put in an expression", async (account) => {
    const fetcher = answering(queryEnvelope({ data: "null" }));
    const read = await readUser(RPC_OK, { account, call: "Name" }, options(fetcher));
    expect(failureOf(read).kind).toBe("bad-name");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["IsDeleted", `gno.land/r/sys/users.ResolveAddress("${ADDRESS}").IsDeleted()`],
    ["Name", `gno.land/r/sys/users.ResolveAddress("${ADDRESS}").Name()`],
  ] as const)("sends %s as one fixed expression and no other", async (call, expression) => {
    const fetcher = answering(queryEnvelope({ data: "null" }));
    await readUser(RPC_OK, { account: ADDRESS, call }, options(fetcher));
    expect(expressionOf(fetcher)).toBe(expression);
  });

  it("sends nothing but the two fixed expressions for a call a cast smuggled in", async () => {
    const fetcher = answering(queryEnvelope({ data: "null" }));
    const smuggled = "Name(); os.Exit(1)" as "Name";
    await readUser(RPC_OK, { account: ADDRESS, call: smuggled }, options(fetcher));
    expect(expressionOf(fetcher)).toBe(`gno.land/r/sys/users.ResolveAddress("${ADDRESS}").IsDeleted()`);
  });
});
