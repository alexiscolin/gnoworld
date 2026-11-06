import { describe, expect, it, vi } from "vitest";
import { statusEnvelope, rpcErrorEnvelope } from "./testing/envelopes.ts";
import type { ChainFetch } from "./read.ts";
import { readTransaction } from "./tx.ts";

// 9d: one `tx` read of the hash, tm2's ResultTx (rpc/core/types/responses.go:249, onyx v1.5.0 toolchain), written from that source,
// NOT recorded. A hash the node has not stored is a -32603 "Internal error" whose `data` is `Could not find tx result for hash
// #<UPPER HEX>` (state/errors.go:84); every other fault of the read (core/tx.go) comes the same way.
const RPC = "https://rpc.onyx.testnets.gno.land:443";
const HASH = "785c189e582beca7c3bccb26afa9ed679bc2a1efc97072dd744d29ce2f83d058";
const BASE64_HASH = "eFwYnlgr7KfDvMsmr6ntZ5vCoe/JcHLddE0pzi+D0Fg=";
const base64Of = (text: string) =>
  btoa(Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join(""));
const notFound = (hash: string) =>
  rpcErrorEnvelope("Internal error", `Could not find tx result for hash #${hash.toUpperCase()}`);

function landed(
  over: {
    height?: string;
    error?: { "@type": string; value?: string } | null;
    data?: string | null;
    log?: string | null;
    hash?: string;
    raw?: string;
  } = {},
) {
  const { height = "55414", error = null, data = "(42 int)", log = "ok", hash = BASE64_HASH } = over;
  return {
    jsonrpc: "2.0",
    id: "",
    result: {
      hash,
      height,
      index: 0,
      tx_result: {
        ResponseBase: {
          Error: error,
          Data: over.raw ?? (data === null ? null : base64Of(data)),
          Events: null,
          ...(log === null ? {} : { Log: log }),
          Info: "",
        },
        GasWanted: "10000000",
        GasUsed: "29710664",
      },
      tx: "AA==",
    },
  };
}
const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)));
function node(answer: unknown, network = "onyx-1") {
  return vi.fn<ChainFetch>((url) =>
    url.includes("/status") ? json(statusEnvelope(55420, "2026-11-05T05:00:00Z", network)) : json(answer),
  );
}
const asked = (fetcher: ReturnType<typeof node>) => fetcher.mock.calls.map(([url]) => url);

describe("readTransaction", () => {
  it("reads the block's height, the returned value and the log of a call that landed, in one tx read of the hash", async () => {
    const fetch = node(landed());
    const read = await readTransaction(RPC, HASH, { chainId: "onyx-1", fetch });
    expect(read).toMatchObject({ ok: true, value: { height: 55414, failed: false, data: "(42 int)", log: "ok" } });
    const tx = asked(fetch).filter((url) => !url.includes("/status"));
    expect(tx).toHaveLength(1);
    expect(tx[0]).toBe(`${RPC}/tx?hash=0x${HASH}`);
  });

  it("says a call the realm refused failed, with the realm's error log, at its height: the chain's word, not Adena's", async () => {
    const fetch = node(landed({ error: { "@type": "/vm.AbciError", value: "boom" }, data: null, log: "panic: boom" }));
    expect(await readTransaction(RPC, HASH, { chainId: "onyx-1", fetch })).toMatchObject({
      ok: true,
      value: { height: 55414, failed: true, data: "", log: "panic: boom" },
    });
  });

  it("is not landed, with a next step, while the node says it has no result for that hash (its real answer, upper-case hex)", async () => {
    const fetch = node(notFound(HASH));
    const read = await readTransaction(RPC, HASH, { chainId: "onyx-1", fetch });
    expect(read).toMatchObject({ ok: false, failure: { kind: "not-landed" } });
    expect(read.ok ? "" : read.failure.next).toMatch(/\S/);
  });

  it.each([
    ["unable to load block results, no such height"],
    ["block not found for height 55414"],
    ["Could not find tx result for hash #ABCDEF"],
    ["not found"],
  ])("is not 'not landed' for another internal error (%s): the chain refused the read", async (text) => {
    const fetch = node(rpcErrorEnvelope("Internal error", text));
    expect(await readTransaction(RPC, HASH, { chainId: "onyx-1", fetch })).toMatchObject({
      ok: false,
      failure: { kind: "chain-refused" },
    });
  });

  it.each([
    ["no height", () => landed({ height: "" })],
    ["a negative height", () => landed({ height: "-1" })],
    ["a height that is not a number", () => landed({ height: "later" })],
    ["a height past what a number holds", () => landed({ height: "9007199254740993" })],
    ["no result", () => ({ jsonrpc: "2.0", id: "", result: {} })],
    ["a data text that is not base64", () => landed({ raw: "***" })],
    ["a data text that is not UTF-8", () => landed({ raw: "/w==" })],
    ["no transaction result", () => ({ jsonrpc: "2.0", id: "", result: { hash: BASE64_HASH, height: "55414" } })],
    ["a hash that is another transaction's", () => landed({ hash: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" })],
    ["a hash that is no 32 bytes", () => landed({ hash: "AA==" })],
    ["no hash", () => landed({ hash: "" })],
  ])("refuses an answer with %s as the wrong shape, never a block", async (_name, answer) => {
    expect(await readTransaction(RPC, HASH, { chainId: "onyx-1", fetch: node(answer()) })).toMatchObject({
      ok: false,
      failure: { kind: "wrong-shape" },
    });
  });

  it("says a call that failed with no log failed, with an empty log: the realm may say nothing", async () => {
    const answer = landed({ error: { "@type": "/vm.AbciError" }, data: null, log: null });
    expect(await readTransaction(RPC, HASH, { chainId: "onyx-1", fetch: node(answer) })).toMatchObject({
      ok: true,
      value: { failed: true, log: "", data: "" },
    });
  });

  it("reads a hash Adena may send in upper case, and finds its answer the same", async () => {
    const fetch = node(landed());
    const read = await readTransaction(RPC, HASH.toUpperCase(), { chainId: "onyx-1", fetch });
    expect(read).toMatchObject({ ok: true, value: { height: 55414 } });
    const [url] = asked(fetch).filter((each) => !each.includes("/status"));
    expect(url?.toLowerCase()).toBe(`${RPC}/tx?hash=0x${HASH}`);
  });

  it("is down, with its next step, for a node that answers 503 or fails: through the one reader, not a block", async () => {
    const answered = vi.fn<ChainFetch>((url) =>
      url.includes("/status")
        ? json(statusEnvelope(55420, "2026-11-05T05:00:00Z", "onyx-1"))
        : Promise.resolve(new Response("down", { status: 503 })),
    );
    const read = await readTransaction(RPC, HASH, { chainId: "onyx-1", fetch: answered });
    expect(read).toMatchObject({ ok: false, failure: { kind: "down" } });
    const broken = vi.fn<ChainFetch>(() => Promise.reject(new TypeError("network")));
    expect(await readTransaction(RPC, HASH, { chainId: "onyx-1", fetch: broken })).toMatchObject({
      ok: false,
      failure: { kind: "down" },
    });
  });

  it("refuses a hash that is not 64 hex digits before anything is asked", async () => {
    for (const bad of ["", "0x" + HASH, HASH.slice(1), `${HASH.slice(1)}g`, `${HASH}&x=1`]) {
      const fetch = node(landed());
      expect(await readTransaction(RPC, bad, { chainId: "onyx-1", fetch })).toMatchObject({
        ok: false,
        failure: { kind: "bad-name" },
      });
      expect(fetch).not.toHaveBeenCalled();
    }
  });

  it("reads nothing of a node that is not the universe's chain", async () => {
    const fetch = node(landed(), "gnoland-1");
    expect(await readTransaction(RPC, HASH, { chainId: "onyx-1", fetch })).toMatchObject({
      ok: false,
      failure: { kind: "other-chain" },
    });
    expect(asked(fetch).some((url) => url.includes("/tx"))).toBe(false);
  });

  it("asks nothing of an address that is not https", async () => {
    const fetch = node(landed());
    expect(await readTransaction("http://rpc.example", HASH, { chainId: "onyx-1", fetch })).toMatchObject({
      ok: false,
      failure: { kind: "refused" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns the realm's value as text and never reads it as anything else", async () => {
    const fetch = node(landed({ data: "<img src=x onerror=alert(1)>" }));
    const read = await readTransaction(RPC, HASH, { chainId: "onyx-1", fetch });
    expect(read.ok ? read.value.data : "").toBe("<img src=x onerror=alert(1)>");
  });

  it("cuts the realm's value and log at 2,048 characters, well formed, so a hostile realm cannot fill the card", async () => {
    const long = `${"a".repeat(2047)}😀${"b".repeat(100_000)}`;
    const fetch = node(landed({ data: long, log: long }));
    const read = await readTransaction(RPC, HASH, { chainId: "onyx-1", fetch, maxBytes: 4 * 1024 * 1024 });
    if (!read.ok) throw new Error("the read failed");
    for (const text of [read.value.data, read.value.log]) {
      expect(text.length).toBeLessThanOrEqual(2049);
      expect(text.isWellFormed()).toBe(true);
      expect(text.endsWith("…")).toBe(true);
    }
    const short = await readTransaction(RPC, HASH, {
      chainId: "onyx-1",
      fetch: node(landed({ data: "a".repeat(2048) })),
    });
    expect(short.ok ? short.value.data : "").toBe("a".repeat(2048));
  });
});
