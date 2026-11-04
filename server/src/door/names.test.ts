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
const setup = (answers: (() => Response | Promise<Response>)[], { max }: { max?: number } = {}) => {
  const calls: Call[] = [];
  const clock = { now: T0 };
  const named = makeNames({
    rpc: RPC,
    now: () => clock.now,
    send: (url, init, ms) => {
      calls.push({ url, init, ms });
      const next = answers.shift();
      return next === undefined ? Promise.reject(new Error("no answer left")) : Promise.resolve(next());
    },
    ...(max === undefined ? {} : { max }),
  });
  return { calls, clock, named };
};

describe("a mainnet name", () => {
  it("asks r/sys/users whether the account's record is missing, by vm/qeval, with a 3 s timeout", async () => {
    const { calls, named } = setup([NAMED]);
    expect(await named(ANNA)).toBe(true);
    const expression = `gno.land/r/sys/users.ResolveAddress("${ANNA}").IsDeleted()`;
    expect(calls).toEqual([
      {
        url: `${RPC}/abci_query?path=%22vm/qeval%22&data=0x${Buffer.from(expression).toString("hex")}`,
        init: { method: "GET", headers: { accept: "application/json" } },
        ms: 3000,
      },
    ]);
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
