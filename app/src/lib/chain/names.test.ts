import { statusEnvelope, queryEnvelope, rpcErrorEnvelope } from "@gnoworld/chain/testing/envelopes";
import type { ChainFetch } from "@gnoworld/chain/read";
import { describe, expect, it, vi } from "vitest";
import { readName, shownName, type Named } from "./names.ts";

// 9f: an account's name on one chain, read live from r/sys/users with its height, and the name the page shows (mainnet's, Onyx's,
// else the short address). NOT recorded: written in the shape of the recorded `vm/qeval` texts (`("aeddi" string)`, `(true bool)`).
const ACCOUNT = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const RPC = "https://rpc.onyx.testnets.gno.land:443";
const NOW = new Date("2026-11-06T06:00:00.000Z");
const USERS = "gno.land/r/sys/users";
const DELETED = `${USERS}.ResolveAddress("${ACCOUNT}").IsDeleted()`;
const NAME = `${USERS}.ResolveAddress("${ACCOUNT}").Name()`;

const expressionOf = (url: string): string | undefined => {
  const hex = /data=0x([0-9a-f]*)/.exec(url)?.[1];
  return hex === undefined
    ? undefined
    : new TextDecoder().decode(Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16)));
};

// A node on onyx-1 at block 55420 that answers each expression it knows with its text.
function node(answers: Record<string, string>) {
  const fetcher = vi.fn<ChainFetch>((url) => {
    const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)));
    if (url.endsWith("/status")) return json(statusEnvelope(55420, "2026-11-06T05:59:58Z", "onyx-1"));
    const expression = expressionOf(url);
    const text = expression === undefined ? undefined : answers[expression];
    return json(text === undefined ? rpcErrorEnvelope("unexpected") : queryEnvelope({ data: text }));
  });
  const expressions = () => fetcher.mock.calls.flatMap(([url]) => expressionOf(url) ?? []);
  return { fetcher, expressions };
}
const options = (fetcher: ChainFetch) => ({ fetch: fetcher, now: () => NOW });
const on = { chainId: "onyx-1", account: ACCOUNT };

describe("readName", () => {
  it("asks r/sys/users whether the account's record is missing, then for its name, and gives the name with the block it was read at", async () => {
    const { fetcher, expressions } = node({ [DELETED]: "(false bool)", [NAME]: '("nym-alexiscolin000" string)' });
    const read = await readName(RPC, on, options(fetcher));
    expect(read).toMatchObject({ ok: true, value: { name: "nym-alexiscolin000", height: 55420 } });
    expect(expressions()).toEqual([DELETED, NAME]);
  });

  it("gives no name, and never asks for one, when the record is missing or deleted", async () => {
    const { fetcher, expressions } = node({ [DELETED]: "(true bool)" });
    const read = await readName(RPC, on, options(fetcher));
    expect(read).toMatchObject({ ok: true, value: { name: null, height: 55420 } });
    expect(expressions()).toEqual([DELETED]);
  });

  // C14 of the review: a room's members are read together, so the block is asked once a chain, not once an account.
  it("takes the block it is given and asks the node for none, the name read at it", async () => {
    const { fetcher, expressions } = node({ [DELETED]: "(false bool)", [NAME]: '("aeddi" string)' });
    const read = await readName(RPC, { ...on, height: 55000 }, options(fetcher));
    expect(read).toMatchObject({ ok: true, value: { name: "aeddi", height: 55000 } });
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/status"))).toEqual([]);
    expect(expressions()).toEqual([DELETED, NAME]);
  });

  it("is a failure, never a no-name, when the node does not answer: the account's name is unknown", async () => {
    const fetcher = vi.fn<ChainFetch>(() => Promise.reject(new TypeError("offline")));
    const read = await readName(RPC, on, options(fetcher));
    expect(read).toMatchObject({ ok: false, failure: { kind: "down" } });
  });

  it("accepts the names r/sys/users holds, legacy ones included: its form is `^[a-z][a-z0-9]*([_-][a-z0-9]+)*$`, 64 at most", async () => {
    for (const legacy of ["aeddi", "a", "bob_the-builder2", "x".repeat(64)]) {
      const { fetcher } = node({ [DELETED]: "(false bool)", [NAME]: `("${legacy}" string)` });
      expect(await readName(RPC, on, options(fetcher))).toMatchObject({ ok: true, value: { name: legacy } });
    }
  });

  it("is a failure, never no name, when the record is there and its name's read then fails", async () => {
    const { fetcher } = node({ [DELETED]: "(false bool)" });
    const read = await readName(RPC, on, options(fetcher));
    expect(read).toMatchObject({ ok: false, failure: { kind: "chain-refused" } });
  });

  it("gives the failure of the record's first read as it is, and asks no name", async () => {
    const { fetcher, expressions } = node({});
    const read = await readName(RPC, on, options(fetcher));
    expect(read).toMatchObject({ ok: false, failure: { kind: "chain-refused" } });
    expect(expressions()).toEqual([DELETED]);
  });

  it("reads the answers whole: a line's end is no part of them, and nothing may come before or after the text", async () => {
    const { fetcher } = node({ [DELETED]: "(false bool)\n", [NAME]: '("aeddi" string)\n' });
    expect(await readName(RPC, on, options(fetcher))).toMatchObject({ ok: true, value: { name: "aeddi" } });
    const gone = node({ [DELETED]: "(true bool)\n" });
    expect(await readName(RPC, on, options(gone.fetcher))).toMatchObject({ ok: true, value: { name: null } });
    for (const text of ['x ("aeddi" string)', '("aeddi" string) ("b" string)']) {
      const bad = node({ [DELETED]: "(false bool)", [NAME]: text });
      expect(await readName(RPC, on, options(bad.fetcher))).toMatchObject({
        ok: false,
        failure: { kind: "wrong-shape" },
      });
    }
  });

  it("is a failure when the node is on another chain than the universe's (a name of Onyx is never taken for mainnet's)", async () => {
    const { fetcher } = node({ [DELETED]: "(false bool)", [NAME]: '("nym-alexiscolin000" string)' });
    const read = await readName(RPC, { chainId: "gnoland-1", account: ACCOUNT }, options(fetcher));
    expect(read).toMatchObject({ ok: false, failure: { kind: "other-chain" } });
  });

  it.each([
    ["a text that is no bool", { [DELETED]: "(1 int)" }],
    ["a name that is no string", { [DELETED]: "(false bool)", [NAME]: "(3 int)" }],
    ["an empty name", { [DELETED]: "(false bool)", [NAME]: '("" string)' }],
    ["a name of 10,000 characters", { [DELETED]: "(false bool)", [NAME]: `("${"a".repeat(10_000)}" string)` }],
    ["a name past 64 characters", { [DELETED]: "(false bool)", [NAME]: `("${"a".repeat(65)}" string)` }],
    [
      "a name with a bidi override",
      { [DELETED]: "(false bool)", [NAME]: `("ab${String.fromCodePoint(0x202e)}cd" string)` },
    ],
    ["a name with a newline", { [DELETED]: "(false bool)", [NAME]: '("ab\\ncd" string)' }],
    ["a name with markup", { [DELETED]: "(false bool)", [NAME]: '("<img onerror=x>" string)' }],
    ["a name with a space", { [DELETED]: "(false bool)", [NAME]: '("ab cd" string)' }],
    ["a name with a capital", { [DELETED]: "(false bool)", [NAME]: '("Alexis" string)' }],
    ["a name that is another type's text", { [DELETED]: "(false bool)", [NAME]: '("nym-a" string) extra' }],
  ])("is wrong-shape for %s", async (_title, answers) => {
    const { fetcher } = node(answers);
    expect(await readName(RPC, on, options(fetcher))).toMatchObject({ ok: false, failure: { kind: "wrong-shape" } });
  });

  it.each([
    'g1x"); os.Exit(1); ("',
    "not-an-address",
    "",
    `${ACCOUNT}")`,
    `${ACCOUNT}\n`,
    `${ACCOUNT}x`,
    ACCOUNT.toUpperCase(),
  ])("asks nothing for %j: only an address the schema proves is put in an expression", async (account) => {
    const { fetcher } = node({});
    const read = await readName(RPC, { chainId: "onyx-1", account }, options(fetcher));
    expect(read).toMatchObject({ ok: false, failure: { kind: "bad-name" } });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("shownName: mainnet's name, else Onyx's, else the short address", () => {
  const read = (chainId: string, name: string | null, height: number): Named => ({ chainId, name, height });
  const MAIN = read("gnoland-1", "nym-mainnetname042", 1_325_774);
  const ONYX = read("onyx-1", "nym-onyxname042", 55_420);

  it("shows the mainnet name, with its height, when the account has one", () => {
    expect(shownName(ACCOUNT, { mainnet: MAIN, onyx: ONYX })).toEqual({
      text: "nym-mainnetname042",
      from: "gnoland-1",
      height: 1_325_774,
    });
  });

  it("shows Onyx's name when mainnet has none, or could not be read", () => {
    const onyx = { text: "nym-onyxname042", from: "onyx-1", height: 55_420 };
    expect(shownName(ACCOUNT, { mainnet: read("gnoland-1", null, 9), onyx: ONYX })).toEqual(onyx);
    expect(shownName(ACCOUNT, { mainnet: undefined, onyx: ONYX })).toEqual(onyx);
  });

  it("shows the short address, no height, when neither chain gives a name", () => {
    const none = { text: "g1jg8m…vsqf5", from: "address", height: undefined };
    expect(shownName(ACCOUNT, { mainnet: read("gnoland-1", null, 9), onyx: read("onyx-1", null, 9) })).toEqual(none);
    expect(shownName(ACCOUNT, { mainnet: undefined, onyx: undefined })).toEqual(none);
  });

  it("takes a name only from the chain it was read on: a read of another chain in a slot is not shown", () => {
    expect(shownName(ACCOUNT, { mainnet: ONYX, onyx: undefined })).toMatchObject({ from: "address" });
    expect(shownName(ACCOUNT, { mainnet: undefined, onyx: MAIN })).toMatchObject({ from: "address" });
  });
});
