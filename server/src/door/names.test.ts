import { Address, toAddress } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { makeNames } from "./names.ts";

// 10g (D92): whether an account has a name on the mainnet, read from r/sys/users through its RPC, for its quota (D43).
const RPC = "https://rpc.gno.land";
const ANNA = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const BEN = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const T0 = Date.parse("2026-11-04T12:00:00.000Z");
const MINUTE = 60_000;

const queried = (data: string | null, error: unknown = null) =>
  new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: "",
      result: { response: { ResponseBase: { Error: error, Data: data, Events: null, Log: "", Info: "" } } },
    }),
  );
const evaluated = (text: string) => queried(Buffer.from(text).toString("base64"));
const NAMED = () => evaluated("(false bool)\n");
// A name's answer of exactly `bytes`, padded in its Log, so only its size can refuse it.
const sized = (bytes: number): Response => {
  const answer = (log: string) =>
    JSON.stringify({
      jsonrpc: "2.0",
      id: "",
      result: {
        response: {
          ResponseBase: {
            Error: null,
            Data: Buffer.from("(false bool)\n").toString("base64"),
            Events: null,
            Log: log,
            Info: "",
          },
        },
      },
    });
  return new Response(answer("x".repeat(bytes - Buffer.byteLength(answer("")))));
};
const NONE = () => evaluated("(true bool)\n");

interface Call {
  url: string;
  init: RequestInit;
  ms: number;
}
// The mainnet's chain (D120): the node's status names it before any name is read there (D118).
const MAINNET = "gnoland-1";
const statusOf = (network: string | null) =>
  new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: "",
      result: {
        ...(network === null ? {} : { node_info: { network } }),
        sync_info: { latest_block_height: "1204", latest_block_time: "2026-11-04T12:00:00Z" },
      },
    }),
  );
// `calls` are the names' reads alone; `asked` every address, the node's status first.
const setup = (
  answers: (() => Response | Promise<Response>)[],
  { max, network = MAINNET, status }: { max?: number; network?: string | null; status?: () => Promise<Response> } = {},
) => {
  const calls: Call[] = [];
  const asked: string[] = [];
  const requests: Call[] = [];
  const lines: unknown[][] = [];
  const clock = { now: T0 };
  const named = makeNames({
    rpc: RPC,
    chainId: MAINNET,
    now: () => clock.now,
    log: (...line) => lines.push(line),
    send: (url, init, ms) => {
      asked.push(url);
      requests.push({ url, init, ms });
      if (url === `${RPC}/status`) return status?.() ?? Promise.resolve(statusOf(network));
      calls.push({ url, init, ms });
      const next = answers.shift();
      return next === undefined ? Promise.reject(new Error("no answer left")) : Promise.resolve(next());
    },
    ...(max === undefined ? {} : { max }),
  });
  return { calls, asked, requests, lines, clock, named };
};

describe("a mainnet name", () => {
  it("asks r/sys/users whether the account's record is missing, by vm/qeval through the chain package, with a 3 s timeout", async () => {
    const { requests, named } = setup([NAMED]);
    expect(await named(ANNA)).toBe(true);
    const expression = `gno.land/r/sys/users.ResolveAddress("${ANNA}").IsDeleted()`;
    const url = `${RPC}/abci_query?path=%22vm%2Fqeval%22&data=0x${Buffer.from(expression).toString("hex")}`;
    // Each request whole (10h's review, V3): a GET with no cookie, no redirect followed, no cache, and no header but accept.
    const init = {
      method: "GET",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      headers: { accept: "application/json" },
    };
    const whole = requests.map(({ url: asked, init: { signal, ...rest }, ms }) => ({
      url: asked,
      init: rest,
      ms,
      signal: signal instanceof AbortSignal,
    }));
    expect(whole).toEqual([
      { url: `${RPC}/status`, init, ms: 3000, signal: true },
      { url, init, ms: 3000, signal: true },
    ]);
  });

  it.each([
    ["another chain", "test5"],
    ["a chain whose id only starts like the mainnet's", "gnoland-10"],
    ["no network", null],
  ])("reads no name on a node whose status names %s: none, the lower quota", async (_, network) => {
    const { calls, asked, named } = setup([NAMED], { network });
    expect(await named(ANNA)).toBe(false);
    expect(calls).toEqual([]);
    expect(asked).toEqual([`${RPC}/status`]);
  });

  it("keeps another chain's answer a minute, as any failed read, asking its status once", async () => {
    const { asked, calls, clock, named } = setup([NAMED], { network: "test5" });
    expect(await named(ANNA)).toBe(false);
    clock.now += MINUTE - 1;
    expect(await named(ANNA)).toBe(false);
    expect(asked).toEqual([`${RPC}/status`]);
    expect(calls).toEqual([]);
  });

  it("is none when the node's status cannot be read, and reads it again a minute later", async () => {
    let up = false;
    const { calls, clock, named } = setup([NAMED], {
      status: () => Promise.resolve(up ? statusOf(MAINNET) : new Response("", { status: 503 })),
    });
    expect(await named(ANNA)).toBe(false);
    expect(calls).toEqual([]);
    up = true;
    clock.now += MINUTE;
    expect(await named(ANNA)).toBe(true);
  });

  it("asks the node's status once a minute, however many accounts it reads (10h's review, V7)", async () => {
    const { asked, clock, named } = setup([NAMED, NONE, NAMED]);
    const statuses = () => asked.filter((url) => url === `${RPC}/status`).length;
    expect(await named(ANNA)).toBe(true);
    clock.now += MINUTE - 1;
    expect(await named(BEN)).toBe(false);
    expect(statuses()).toBe(1);
    clock.now += 1;
    expect(await named(Address.parse(addressAt(1)))).toBe(true);
    expect(statuses()).toBe(2);
  });

  it("logs a failed read's kind once a minute, never the account (10h's review, V9)", async () => {
    const { lines, clock, named } = setup([], { network: "test5" });
    await named(ANNA);
    await named(BEN);
    expect(lines).toEqual([["name_failed", { error: "other_chain" }]]);
    clock.now += MINUTE - 1;
    await named(Address.parse(addressAt(1)));
    expect(lines).toHaveLength(1);
    clock.now += 1;
    await named(Address.parse(addressAt(2)));
    expect(lines).toEqual([
      ["name_failed", { error: "other_chain" }],
      ["name_failed", { error: "other_chain" }],
    ]);
  });

  it.each([
    ["a node that does not answer", { status: () => Promise.resolve(new Response("", { status: 503 })) }, [], "down"],
    ["an answer of another value", {}, [() => evaluated("(1 int)")], "wrong_shape"],
    ["an answer past 64 KiB", {}, [() => sized(64 * 1024 + 1)], "too_big"],
  ])("logs %s as its kind", async (...[, over, answers, error]) => {
    const { lines, named } = setup(answers, over);
    expect(await named(ANNA)).toBe(false);
    expect(lines).toEqual([["name_failed", { error }]]);
  });

  it("logs no read that gives a name, or none, only the one that fails", async () => {
    const { lines, named } = setup([NAMED, NONE, () => evaluated("(1 int)")]);
    await named(ANNA);
    await named(BEN);
    expect(lines).toEqual([]);
    await named(Address.parse(addressAt(1)));
    expect(lines).toEqual([["name_failed", { error: "wrong_shape" }]]);
  });

  it("is none when the record is missing", async () => {
    const { named } = setup([NONE]);
    expect(await named(BEN)).toBe(false);
  });

  it("takes the answer with or without its trailing line", async () => {
    const { named } = setup([() => evaluated("(false bool)")]);
    expect(await named(ANNA)).toBe(true);
  });

  it("is none, never a name, whenever the read fails", async () => {
    const failures: [string, () => Response | Promise<Response>][] = [
      ["a status", () => new Response("down", { status: 503 })],
      ["text that is not JSON", () => new Response("<html>")],
      ["another shape", () => new Response(JSON.stringify({ result: { nothing: true } }))],
      ["the chain's refusal", () => queried(null, { "@type": "/vm.InvalidPkgPathError", value: "" })],
      [
        "the chain's refusal beside a name's data",
        () => queried(Buffer.from("(false bool)\n").toString("base64"), { "@type": "/std.InternalError", value: "" }),
      ],
      ["no data", () => queried(null)],
      ["data that is not base64 of text", () => queried(Buffer.from([0xff, 0xfe]).toString("base64"))],
      ["another value", () => evaluated("(1 int)")],
      [
        "the node's error, with no result",
        () => new Response(JSON.stringify({ jsonrpc: "2.0", id: "", error: { code: -32603 } })),
      ],
      ["a value that only begins as a name's", () => evaluated("(false bool)\n(true bool)")],
      ["a name's answer past 64 KiB", () => sized(64 * 1024 + 1)],
      ["a timeout", () => Promise.reject(new DOMException("timed out", "TimeoutError"))],
      ["a refused connection", () => Promise.reject(new TypeError("fetch failed"))],
    ];
    for (const [why, answer] of failures) {
      const { named } = setup([answer]);
      expect([why, await named(ANNA)]).toEqual([why, false]);
    }
  });

  it("reads an answer of 64 KiB, the cap", async () => {
    const { named } = setup([() => sized(64 * 1024)]);
    expect(await named(ANNA)).toBe(true);
  });

  it("is read again an hour after a name was found", async () => {
    const { calls, clock, named } = setup([NAMED, NONE]);
    await named(ANNA);
    clock.now += 60 * MINUTE - 1;
    expect(await named(ANNA)).toBe(true);
    clock.now += 1;
    expect(await named(ANNA)).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it("is read again ten minutes after none was found, so a name just taken counts soon", async () => {
    const { calls, clock, named } = setup([NONE, NAMED]);
    await named(BEN);
    clock.now += 10 * MINUTE - 1;
    expect(await named(BEN)).toBe(false);
    clock.now += 1;
    expect(await named(BEN)).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("is read again a minute after an answer of another value, as after any failed read", async () => {
    const { calls, clock, named } = setup([() => evaluated("(1 int)"), NAMED]);
    await named(ANNA);
    clock.now += MINUTE;
    expect(await named(ANNA)).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("is read again a minute after a failed read", async () => {
    const { calls, clock, named } = setup([() => new Response("", { status: 500 }), NAMED]);
    await named(ANNA);
    clock.now += MINUTE - 1;
    expect(await named(ANNA)).toBe(false);
    clock.now += 1;
    expect(await named(ANNA)).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("holds 10,000 accounts by default, the one read longest ago leaving first", async () => {
    const answers = Array.from({ length: 10_002 }, () => NAMED);
    const { calls, named } = setup(answers);
    const many = Array.from({ length: 10_000 }, (_, at) => Address.parse(addressAt(at)));
    for (const account of many) await named(account);
    await named(BEN);
    expect(calls).toHaveLength(10_001);
    await named(many[1] ?? BEN);
    expect(calls).toHaveLength(10_001);
    await named(many[0] ?? BEN);
    expect(calls).toHaveLength(10_002);
  });
});

// A real address for a number, its bech32 written by the schema's own encoder.
function addressAt(at: number): string {
  const bytes = Buffer.alloc(20);
  bytes.writeUInt32BE(at);
  return toAddress(bytes);
}
