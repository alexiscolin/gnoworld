import { describe, expect, it, vi } from "vitest";
import { readEvaluated, readFunctionList, readHeight, readRender, type NodeOptions } from "./node.ts";
import type { ChainFetch, ChainRead } from "./read.ts";
import { queryEnvelope, rpcErrorEnvelope, statusEnvelope } from "./testing/envelopes.ts";

// The universe check (D118; 10f's security review): a read given a chain's id asks the node's /status first and reads
// nothing more of a node whose network is another chain, or that names none. A fake node answers each address it is asked.
const RPC = "https://rpc.onyx.example:443";
const LIST = [{ FuncName: "Vote", Params: [{ Name: "id", Type: "int" }] }];

interface Node {
  /** The network the node's /status names; none when undefined. */
  network?: string;
  status?: number;
  /** The /status body as the node writes it, in place of the envelope. */
  statusText?: string;
  /** Called at each address asked, before it answers. */
  onAsk?: (url: string) => void;
}

// A node that answers /status with its network and every abci_query with a page, a value and a list of functions.
function fakeNode({ network, status = 200, statusText, onAsk }: Node = {}) {
  const asked: string[] = [];
  const fetch: ChainFetch = (url) => {
    asked.push(url);
    onAsk?.(url);
    if (status !== 200) return Promise.resolve(new Response("", { status }));
    if (url.endsWith("/status") && statusText !== undefined) return Promise.resolve(new Response(statusText));
    const body = url.endsWith("/status")
      ? statusEnvelope(1204, "2026-11-04T03:34:18Z", network)
      : queryEnvelope({ data: url.includes("vm%2Fqfuncs") ? JSON.stringify(LIST) : "(12 int)" });
    return Promise.resolve(Response.json(body));
  };
  return { asked, fetch };
}
const withInfo = (info: unknown) => {
  const { result, ...rest } = statusEnvelope(1204, "2026-11-04T03:34:18Z");
  return JSON.stringify({ ...rest, result: { ...result, node_info: info } });
};

const paths = (asked: readonly string[]) =>
  asked.map((url) => (url.endsWith("/status") ? "status" : (/path=%22(vm%2Fq[a-z]+)%22/.exec(url)?.[1] ?? url)));

const reads = () =>
  [
    ["readRender", (o: NodeOptions) => readRender(RPC, "gno.land/r/demo/poll:", o), "vm%2Fqrender"],
    ["readEvaluated", (o: NodeOptions) => readEvaluated(RPC, "gno.land/r/demo/poll.Count()", o), "vm%2Fqeval"],
    ["readFunctionList", (o: NodeOptions) => readFunctionList(RPC, "gno.land/r/demo/poll", o), "vm%2Fqfuncs"],
  ] as const;

const kindOf = (read: ChainRead<unknown>) => (read.ok ? "ok" : read.failure.kind);

describe("a node read given its universe's chain", () => {
  it.each(reads())(
    "%s asks the node's status first, then reads the node that is that chain",
    async (_name, run, path) => {
      const node = fakeNode({ network: "onyx-1" });
      const read = await run({ fetch: node.fetch, chainId: "onyx-1" });
      expect(kindOf(read)).toBe("ok");
      expect(paths(node.asked)).toEqual(["status", path]);
    },
  );

  it.each(reads())("%s refuses a node of another chain, asking it nothing more", async (_name, run) => {
    const node = fakeNode({ network: "test5" });
    const read = await run({ fetch: node.fetch, chainId: "onyx-1" });
    expect(read).toMatchObject({ ok: false, failure: { kind: "other-chain" }, source: { url: `${RPC}/status` } });
    expect(read.ok || read.failure.next).toMatch(/^The node answering is not this universe's chain/);
    expect(JSON.stringify(read)).not.toContain("test5");
    expect(paths(node.asked)).toEqual(["status"]);
  });

  it.each([
    ["a node_info with no network", withInfo({}), "other-chain"],
    ["an empty network", withInfo({ network: "" }), "other-chain"],
    ["a network that is no text", withInfo({ network: 5 }), "wrong-shape"],
    ["a status that is no JSON", "<html>", "not-json"],
    ["the node's error envelope", JSON.stringify(rpcErrorEnvelope("boom")), "wrong-shape"],
  ])("reads no functions of a node whose status is %s", async (_case, statusText, kind) => {
    const node = fakeNode({ statusText });
    const read = await readFunctionList(RPC, "gno.land/r/demo/poll", { fetch: node.fetch, chainId: "onyx-1" });
    expect(kindOf(read)).toBe(kind);
    expect(paths(node.asked)).toEqual(["status"]);
  });

  it("reads no functions of a node whose status is past the cap, or too slow", async () => {
    const big = fakeNode({ statusText: withInfo({ network: "onyx-1", pad: "x".repeat(4096) }) });
    const capped = await readFunctionList(RPC, "gno.land/r/demo/poll", {
      fetch: big.fetch,
      chainId: "onyx-1",
      maxBytes: 1024,
    });
    expect(kindOf(capped)).toBe("too-big");
    expect(paths(big.asked)).toEqual(["status"]);
    const asked: string[] = [];
    const slow: ChainFetch = (url) => {
      asked.push(url);
      return new Promise(() => undefined);
    };
    const late = await readFunctionList(RPC, "gno.land/r/demo/poll", { fetch: slow, chainId: "onyx-1", timeoutMs: 20 });
    expect(kindOf(late)).toBe("timeout");
    expect(paths(asked)).toEqual(["status"]);
  });

  it("refuses an RPC that is no https address before asking its status", async () => {
    const node = fakeNode({ network: "onyx-1" });
    const read = await readFunctionList("http://rpc.onyx.example", "gno.land/r/demo/poll", {
      fetch: node.fetch,
      chainId: "onyx-1",
    });
    expect(kindOf(read)).toBe("refused");
    expect(node.asked).toEqual([]);
  });

  it("asks the status of an RPC written with its last slash at the same address", async () => {
    const node = fakeNode({ network: "onyx-1" });
    await readFunctionList(`${RPC}/`, "gno.land/r/demo/poll", { fetch: node.fetch, chainId: "onyx-1" });
    expect(node.asked[0]).toBe(`${RPC}/status`);
    expect(node.asked[1]).toMatch(new RegExp(`^${RPC.replace(/\./g, "\\.")}/abci_query\\?`));
  });

  it("asks nothing more once its caller's signal ends while the status is read", async () => {
    const call = new AbortController();
    const node = fakeNode({
      network: "onyx-1",
      onAsk: () => {
        call.abort();
      },
    });
    const read = await readFunctionList(RPC, "gno.land/r/demo/poll", {
      fetch: node.fetch,
      chainId: "onyx-1",
      signal: call.signal,
    });
    expect(kindOf(read)).toBe("down");
    expect(paths(node.asked)).toEqual(["status"]);
  });

  it("takes an empty chain id as no chain at all: every node is another", async () => {
    const node = fakeNode({ network: "" });
    expect(kindOf(await readFunctionList(RPC, "gno.land/r/demo/poll", { fetch: node.fetch, chainId: "" }))).toBe(
      "other-chain",
    );
    expect(paths(node.asked)).toEqual(["status"]);
  });

  it.each(reads())("%s refuses a node whose status names no network", async (_name, run) => {
    const node = fakeNode();
    expect(kindOf(await run({ fetch: node.fetch, chainId: "onyx-1" }))).toBe("other-chain");
    expect(paths(node.asked)).toEqual(["status"]);
  });

  it.each(reads())("%s fails as its status does when the node does not answer it", async (_name, run) => {
    const node = fakeNode({ network: "onyx-1", status: 503 });
    const read = await run({ fetch: node.fetch, chainId: "onyx-1" });
    expect(read).toMatchObject({ ok: false, failure: { kind: "down", status: 503 } });
    expect(node.asked).toHaveLength(1);
  });

  it.each(reads())("%s asks no status when its chain is null, as the app reads", async (_name, run, path) => {
    const node = fakeNode({ network: "test5" });
    expect(kindOf(await run({ fetch: node.fetch, chainId: null }))).toBe("ok");
    expect(paths(node.asked)).toEqual([path]);
  });

  it.each(reads())("%s asks nothing once its caller's signal has ended", async (_name, run) => {
    const node = fakeNode({ network: "onyx-1" });
    const read = await run({ fetch: node.fetch, chainId: "onyx-1", signal: AbortSignal.abort() });
    expect(kindOf(read)).toBe("down");
    expect(node.asked).toEqual([]);
  });

  it("compares the network whole: a chain whose id only starts or ends like the universe's is another", async () => {
    for (const network of ["onyx-10", "onyx", "xonyx-1", "ONYX-1", " onyx-1"]) {
      const node = fakeNode({ network });
      expect(
        kindOf(await readFunctionList(RPC, "gno.land/r/demo/poll", { fetch: node.fetch, chainId: "onyx-1" })),
      ).toBe("other-chain");
    }
  });

  it("readHeight checks the network on the one status it reads", async () => {
    const same = fakeNode({ network: "onyx-1" });
    expect(await readHeight(RPC, { fetch: same.fetch, chainId: "onyx-1" })).toMatchObject({
      ok: true,
      value: { height: 1204, time: "2026-11-04T03:34:18Z" },
    });
    expect(paths(same.asked)).toEqual(["status"]);
    const other = fakeNode({ network: "gnoland-1" });
    expect(kindOf(await readHeight(RPC, { fetch: other.fetch, chainId: "onyx-1" }))).toBe("other-chain");
    expect(paths(other.asked)).toEqual(["status"]);
  });

  it("gives its status and its query one time limit together, never one each (10h's review, V1)", async () => {
    vi.useFakeTimers();
    try {
      const signals: (AbortSignal | undefined)[] = [];
      const fetch: ChainFetch = (url, init) => {
        signals.push(init?.signal ?? undefined);
        if (!url.endsWith("/status")) return new Promise(() => undefined);
        const body = statusEnvelope(1204, "2026-11-04T03:34:18Z", "onyx-1");
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(Response.json(body));
          }, 2900);
        });
      };
      let read: ChainRead<string> | undefined;
      const options = { fetch, chainId: "onyx-1", timeoutMs: 3000 };
      const settled = readEvaluated(RPC, "gno.land/r/demo/poll.Count()", options).then((value) => {
        read = value;
      });
      await vi.advanceTimersByTimeAsync(3000);
      expect(read).toMatchObject({ ok: false, failure: { kind: "timeout" }, source: { url: RPC } });
      expect(signals).toHaveLength(2);
      expect(signals[1]?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(10_000);
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });

  it("readFunctionList gives qfuncs' list as the node wrote it, with where it was read", async () => {
    const node = fakeNode({ network: "onyx-1" });
    const read = await readFunctionList(RPC, "gno.land/r/demo/poll", { fetch: node.fetch, chainId: "onyx-1" });
    expect(read).toMatchObject({ ok: true, value: LIST });
    expect(read.source.url).toMatch(/\/abci_query\?path=%22vm%2Fqfuncs%22&data=0x/);
  });
});

// A caller's memory of its nodes' checks (10h's review, V7): a node seen on its chain is asked its status once a minute.
describe("a node read given its caller's memory of the nodes it saw on their chain", () => {
  const T0 = Date.parse("2026-11-04T12:00:00.000Z");
  const at = (ms: number) => () => new Date(T0 + ms);

  it("asks a node seen on its chain no status for a minute, then asks it again", async () => {
    const node = fakeNode({ network: "onyx-1" });
    const seen = new Map<string, number>();
    const read = (ms: number) =>
      readFunctionList(RPC, "gno.land/r/demo/poll", { fetch: node.fetch, chainId: "onyx-1", seen, now: at(ms) });
    expect(kindOf(await read(0))).toBe("ok");
    expect(kindOf(await read(59_999))).toBe("ok");
    expect(paths(node.asked)).toEqual(["status", "vm%2Fqfuncs", "vm%2Fqfuncs"]);
    expect(kindOf(await read(60_000))).toBe("ok");
    expect(paths(node.asked)).toEqual(["status", "vm%2Fqfuncs", "vm%2Fqfuncs", "status", "vm%2Fqfuncs"]);
  });

  it.each([
    ["another chain's", { network: "test5" }],
    ["one whose status failed", { network: "onyx-1", status: 503 }],
  ])("remembers no node found to be %s, but the one found on its chain next", async (_case, answers) => {
    const node = fakeNode(answers);
    const seen = new Map<string, number>();
    const options = { fetch: node.fetch, chainId: "onyx-1", seen, now: at(0) };
    expect(kindOf(await readRender(RPC, "x:", options))).not.toBe("ok");
    expect(kindOf(await readRender(RPC, "x:", options))).not.toBe("ok");
    expect(paths(node.asked)).toEqual(["status", "status"]);
    expect(seen.size).toBe(0);
    const good = fakeNode({ network: "onyx-1" });
    expect(kindOf(await readRender(RPC, "x:", { ...options, fetch: good.fetch }))).toBe("ok");
    expect(seen.size).toBe(1);
  });

  it("remembers a node for the chain it was seen on, at its address with or without its last slash", async () => {
    const node = fakeNode({ network: "onyx-1" });
    const seen = new Map<string, number>();
    await readRender(RPC, "x:", { fetch: node.fetch, chainId: "onyx-1", seen, now: at(0) });
    await readRender(`${RPC}/`, "x:", { fetch: node.fetch, chainId: "onyx-1", seen, now: at(1) });
    expect(paths(node.asked)).toEqual(["status", "vm%2Fqrender", "vm%2Fqrender"]);
    const other = { fetch: node.fetch, chainId: "test5", seen, now: at(2) };
    expect(kindOf(await readRender(RPC, "x:", other))).toBe("other-chain");
    await readRender("https://rpc.other.example", "x:", { fetch: node.fetch, chainId: "onyx-1", seen, now: at(3) });
    expect(paths(node.asked).slice(3)).toEqual(["status", "status", "vm%2Fqrender"]);
    expect(seen.size).toBe(2);
  });

  it("neither reads nor fills the memory for a read whose chain is null, as one naming it does", async () => {
    const node = fakeNode({ network: "onyx-1" });
    const seen = new Map<string, number>();
    await readRender(RPC, "x:", { fetch: node.fetch, chainId: null, seen, now: at(0) });
    expect(paths(node.asked)).toEqual(["vm%2Fqrender"]);
    expect(seen.size).toBe(0);
    await readRender(RPC, "x:", { fetch: node.fetch, chainId: "onyx-1", seen, now: at(0) });
    expect(seen.size).toBe(1);
  });
});

// The answer inside a node's envelope, read by the package's own reads (the app's rpc.test.ts reads it through its wrappers,
// which StrykerJS does not see: its sandbox links the workspaces' packages to the tree).
describe("a node's answer inside its envelope", () => {
  const answering =
    (body: unknown): ChainFetch =>
    () =>
      Promise.resolve(Response.json(body));
  const based = (base: Record<string, unknown>) => ({
    jsonrpc: "2.0",
    id: "",
    result: { response: { ResponseBase: { Error: null, Data: null, Log: "", Info: "", ...base } } },
  });

  it("asks qfuncs with the realm's path in hex, at the address the read names", async () => {
    const node = fakeNode();
    await readFunctionList(RPC, "gno.land/r/demo/poll", { fetch: node.fetch, chainId: null });
    expect(node.asked).toEqual([
      `${RPC}/abci_query?path=%22vm%2Fqfuncs%22&data=0x676e6f2e6c616e642f722f64656d6f2f706f6c6c`,
    ]);
  });

  it("gives a page's text, and an empty list for a realm with none", async () => {
    expect(
      await readRender(RPC, "gno.land/r/demo/poll:", {
        fetch: answering(queryEnvelope({ data: "# Poll" })),
        chainId: null,
      }),
    ).toMatchObject({ ok: true, value: "# Poll" });
    const none = await readFunctionList(RPC, "gno.land/r/demo/poll", {
      fetch: answering(queryEnvelope({ data: "null" })),
      chainId: null,
    });
    expect(none).toMatchObject({ ok: true, value: [] });
  });

  it.each([
    [
      "a realm the chain has not",
      queryEnvelope({ data: null, error: { "@type": "/vm.InvalidPkgPathError" } }),
      "no-realm",
    ],
    ["a realm with no page", queryEnvelope({ data: null, error: { "@type": "/vm.NoRenderDeclError" } }), "no-page"],
    ["another refusal", queryEnvelope({ data: null, error: { "@type": "/std.InternalError" } }), "chain-refused"],
    [
      "a refusal beside data",
      based({ Data: btoa("(1 int)"), Error: { "@type": "/std.InternalError" } }),
      "chain-refused",
    ],
    ["the node's error, with no result", rpcErrorEnvelope("boom"), "chain-refused"],
    ["neither a result nor an error", { jsonrpc: "2.0", id: "" }, "wrong-shape"],
    ["no data and no refusal", queryEnvelope({ data: null }), "wrong-shape"],
    ["data that is no base64", based({ Data: "%%%" }), "wrong-shape"],
    ["bytes that are no UTF-8", based({ Data: btoa(String.fromCharCode(0xff, 0xfe)) }), "wrong-shape"],
  ])("gives %s as its kind, never a value", async (_case, body, kind) => {
    expect(kindOf(await readRender(RPC, "gno.land/r/demo/poll:", { fetch: answering(body), chainId: null }))).toBe(
      kind,
    );
  });

  it("refuses a function list that is no list, and keeps a failed request's status", async () => {
    const odd = await readFunctionList(RPC, "gno.land/r/demo/poll", {
      fetch: answering(queryEnvelope({ data: "nope" })),
      chainId: null,
    });
    expect(kindOf(odd)).toBe("wrong-shape");
    const down = await readEvaluated(RPC, "gno.land/r/demo/poll.Count()", {
      fetch: fakeNode({ status: 502 }).fetch,
      chainId: null,
    });
    expect(down).toMatchObject({ ok: false, failure: { kind: "down", status: 502 } });
  });

  it("refuses a height past what a number holds whole", async () => {
    const status = statusEnvelope(1, "2026-11-04T03:34:18Z");
    const huge = {
      ...status,
      result: { ...status.result, sync_info: { ...status.result.sync_info, latest_block_height: "9".repeat(20) } },
    };
    expect(kindOf(await readHeight(RPC, { fetch: answering(huge), chainId: null }))).toBe("wrong-shape");
  });
});

describe("the node reads' edges", () => {
  const answering =
    (body: unknown): ChainFetch =>
    () =>
      Promise.resolve(Response.json(body));

  it("writes a byte under 0x10 with its two hex digits", async () => {
    const node = fakeNode();
    await readRender(RPC, "a\n", { fetch: node.fetch, chainId: null });
    expect(node.asked[0]).toMatch(/&data=0x610a$/);
  });

  it("reads a body with no Error key as a good one", async () => {
    const body = { jsonrpc: "2.0", id: "", result: { response: { ResponseBase: { Data: btoa("(12 int)") } } } };
    expect(
      await readEvaluated(RPC, "gno.land/r/demo/poll.Count()", { fetch: answering(body), chainId: null }),
    ).toMatchObject({
      ok: true,
      value: "(12 int)",
    });
  });

  it("refuses a function list whose bytes are no UTF-8, never an empty list", async () => {
    const body = {
      jsonrpc: "2.0",
      id: "",
      result: { response: { ResponseBase: { Error: null, Data: btoa("\xff\xfe") } } },
    };
    expect(kindOf(await readFunctionList(RPC, "gno.land/r/demo/poll", { fetch: answering(body), chainId: null }))).toBe(
      "wrong-shape",
    );
  });

  it("refuses an http RPC as the address it was given, for every read", async () => {
    const node = fakeNode({ network: "onyx-1" });
    for (const read of [
      readHeight("http://rpc.onyx.example", { fetch: node.fetch, chainId: null }),
      readRender("http://rpc.onyx.example", "x:", { fetch: node.fetch, chainId: "onyx-1" }),
    ])
      expect(await read).toMatchObject({
        ok: false,
        failure: { kind: "refused" },
        source: { url: "http://rpc.onyx.example" },
      });
    expect(node.asked).toEqual([]);
  });

  it("reads the height of a node that names a network when its chain is null, as the app does", async () => {
    const node = fakeNode({ network: "test5" });
    expect(await readHeight(RPC, { fetch: node.fetch, chainId: null })).toMatchObject({
      ok: true,
      value: { height: 1204 },
    });
  });
});
