import { describe, expect, it } from "vitest";
import { readEvaluated, readFunctionList, readHeight, readRender } from "./node.ts";
import type { ChainFetch, ChainRead, ReadOptions } from "./read.ts";
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
    ["readRender", (o: ReadOptions) => readRender(RPC, "gno.land/r/demo/poll:", o), "vm%2Fqrender"],
    ["readEvaluated", (o: ReadOptions) => readEvaluated(RPC, "gno.land/r/demo/poll.Count()", o), "vm%2Fqeval"],
    ["readFunctionList", (o: ReadOptions) => readFunctionList(RPC, "gno.land/r/demo/poll", o), "vm%2Fqfuncs"],
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

  it.each(reads())("%s asks no status when no chain is named, as the app reads", async (_name, run, path) => {
    const node = fakeNode({ network: "test5" });
    expect(kindOf(await run({ fetch: node.fetch }))).toBe("ok");
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

  it("readFunctionList gives qfuncs' list as the node wrote it, with where it was read", async () => {
    const node = fakeNode({ network: "onyx-1" });
    const read = await readFunctionList(RPC, "gno.land/r/demo/poll", { fetch: node.fetch, chainId: "onyx-1" });
    expect(read).toMatchObject({ ok: true, value: LIST });
    expect(read.source.url).toMatch(/\/abci_query\?path=%22vm%2Fqfuncs%22&data=0x/);
  });
});
