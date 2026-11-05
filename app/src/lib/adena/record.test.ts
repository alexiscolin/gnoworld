import { Address, CallRequest } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { accountOf, record, recordCall } from "./record.ts";

// Every source the app builds, as text: tests and stories are no build.
const SOURCES = import.meta.glob<string>(["../../**/*.{ts,tsx}", "!../../**/*.{test,stories}.*"], {
  query: "?raw",
  import: "default",
  eager: true,
});
const CALLER = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const ONYX = { chainId: "onyx-1", name: "Onyx", rpc: "https://rpc.onyx.testnets.gno.land:443" };
const REQUEST = CallRequest.parse({
  chainId: "onyx-1",
  caller: CALLER,
  realm: "gno.land/r/demo/counter",
  func: "Increment",
  args: [],
});

// What DoContract is given for REQUEST on Onyx, written out: the message, no coins, no memo, the fee and the pinned network.
const message = (args: string[]) => ({
  type: "/vm.m_call",
  value: {
    caller: CALLER,
    send: "",
    max_deposit: "",
    pkg_path: "gno.land/r/demo/counter",
    func: "Increment",
    args,
  },
});
const transactionOf = (args: string[]) => ({
  messages: [message(args)],
  gasFee: 1_000_000,
  gasWanted: 10_000_000,
  networkInfo: { chainId: "onyx-1", rpcUrl: "https://rpc.onyx.testnets.gno.land:443" },
});
const TRANSACTION = transactionOf([]);

// An extension that records each call it is asked and answers as told.
const wallet = (answers: Record<string, unknown>) => {
  const asked: { call: string; args: unknown[] }[] = [];
  const adena = Object.fromEntries(
    ["AddEstablish", "GetAccount", "GetNetwork", "SwitchNetwork", "DoContract", "SignArbitrary"].map((call) => [
      call,
      (...args: unknown[]) => {
        asked.push({ call, args });
        return Promise.resolve(answers[call]);
      },
    ]),
  );
  return { adena, asked };
};

describe("record", () => {
  it("asks nothing until a step is run, then one call, once", async () => {
    const { adena, asked } = wallet({ GetNetwork: { status: "success" } });
    expect(asked).toEqual([]);
    await record(adena, "network", { call: "GetNetwork" });
    expect(asked).toEqual([{ call: "GetNetwork", args: [] }]);
  });

  it("keeps the answer as Adena gave it, the account's address and chain included", async () => {
    const answer = {
      code: 0,
      status: "success",
      type: "GET_ACCOUNT",
      message: "",
      data: { address: CALLER, chainId: "onyx-1", accountNumber: "7", sequence: "3", coins: "12ugnot" },
    };
    const { adena } = wallet({ GetAccount: answer });
    expect(await record(adena, "account", { call: "GetAccount" })).toEqual({
      label: "account",
      call: "GetAccount",
      args: [],
      answer,
    });
  });

  it("sends the chain to SwitchNetwork and the call's own transaction to DoContract, nothing else", async () => {
    const { adena, asked } = wallet({ SwitchNetwork: { status: "failure" }, DoContract: { status: "failure" } });
    await record(adena, "switch", { call: "SwitchNetwork", chainId: "onyx-1" });
    await record(adena, "call", { call: "DoContract", request: REQUEST, universe: ONYX });
    expect(asked).toEqual([
      { call: "SwitchNetwork", args: ["onyx-1"] },
      { call: "DoContract", args: [TRANSACTION] },
    ]);
  });

  it("asks Adena to let gnoworld in, by its name, and keeps the answer: the first step of a run (F5645)", async () => {
    const answer = { code: 0, status: "success", type: "CONNECTION_SUCCESS", message: "", data: {} };
    const { adena, asked } = wallet({ AddEstablish: answer });
    expect(await record(adena, "connect", { call: "AddEstablish" })).toEqual({
      label: "connect",
      call: "AddEstablish",
      args: ["gnoworld"],
      answer,
    });
    expect(asked).toEqual([{ call: "AddEstablish", args: ["gnoworld"] }]);
  });

  it("keeps a refusal, a rejection and a missing method as entries, never as a throw", async () => {
    const { adena } = wallet({});
    const rejecting = { GetNetwork: () => Promise.reject(new Error("gone")) };
    expect(await record(rejecting, "network", { call: "GetNetwork" })).toMatchObject({ threw: "Error: gone" });
    expect(await record({}, "network", { call: "GetNetwork" })).toMatchObject({ threw: "no such method" });
    expect(await record(adena, "network", { call: "GetNetwork" })).toMatchObject({ answer: null });
  });

  it("is imported by no page of the app: it is in no build", () => {
    const users = Object.entries(SOURCES)
      .filter(([name, text]) =>
        name.includes("/lib/adena/") ? /["']\.\/record\.ts["']/.test(text) : /\/adena\/record\.ts["']/.test(text),
      )
      .map(([name]) => name);
    expect(users).toEqual([]);
  });
});

// The recording page's call step, run on a fake wallet (F5667, F5668, F5652).
describe("recordCall", () => {
  const ACCOUNT = { status: "success", type: "GET_ACCOUNT", data: { address: CALLER, chainId: "onyx-1" } };
  const FORM = { account: "", realm: "gno.land/r/demo/counter", func: "Increment", args: "", universe: ONYX };

  it("reads the account first when none is known, then calls as it with the form's fields", async () => {
    const { adena, asked } = wallet({ GetAccount: ACCOUNT, DoContract: { status: "success" } });
    const done = await recordCall(adena, "call, signed", FORM);
    expect(done.account).toBe(CALLER);
    expect(done.entries.map((e) => [e.label, e.call])).toEqual([
      ["account", "GetAccount"],
      ["call, signed", "DoContract"],
    ]);
    expect(asked).toEqual([
      { call: "GetAccount", args: [] },
      { call: "DoContract", args: [TRANSACTION] },
    ]);
  });

  it("calls as the account it knows, reading nothing first, one argument a line", async () => {
    const { adena, asked } = wallet({ DoContract: { status: "success" } });
    await recordCall(adena, "call", { ...FORM, account: CALLER, args: "1\ntwo" });
    expect(asked).toEqual([{ call: "DoContract", args: [transactionOf(["1", "two"])] }]);
  });

  it("records no call, and asks for none, while Adena gives no account: it has not let the page in", async () => {
    const { adena, asked } = wallet({ GetAccount: { status: "failure", type: "NOT_CONNECTED", data: {} } });
    const done = await recordCall(adena, "call", FORM);
    expect(done.account).toBe("");
    expect(done.entries.map((e) => e.call)).toEqual(["GetAccount"]);
    expect(asked.map((a) => a.call)).toEqual(["GetAccount"]);
  });

  it.each([
    ["a realm that is a package", { realm: "gno.land/p/demo/avl" }],
    ["a function that is not exported", { func: "lower" }],
    ["an argument past 8,192 bytes", { args: "x".repeat(20_000) }],
    ["a control character in an argument", { args: `a${String.fromCodePoint(0x202e)}b` }],
  ])("records %s as malformed, and asks Adena nothing to sign", async (_, change) => {
    const { adena, asked } = wallet({ DoContract: { status: "success" } });
    const done = await recordCall(adena, "call", { ...FORM, account: CALLER, ...change });
    expect(done.entries).toStrictEqual([{ label: "call", call: "DoContract", args: [], threw: "malformed" }]);
    expect(asked).toEqual([]);
  });

  it("records a caller that is no address as malformed: Adena's answer is read as outside data", async () => {
    const { adena, asked } = wallet({ GetAccount: { data: { address: "nobody" } } });
    const done = await recordCall(adena, "call", FORM);
    expect(done.entries.at(-1)).toMatchObject({ call: "DoContract", threw: "malformed" });
    expect(asked.map((a) => a.call)).toEqual(["GetAccount"]);
  });
});

describe("accountOf", () => {
  it("reads the address of a GetAccount entry, and is empty for any other answer", () => {
    const entry = (answer: unknown) => ({ label: "account", call: "GetAccount", args: [], answer });
    expect(accountOf(entry({ data: { address: CALLER } }))).toBe(CALLER);
    expect(accountOf(entry({ data: {} }))).toBe("");
    expect(accountOf(entry(null))).toBe("");
    expect(accountOf({ label: "account", call: "GetAccount", args: [], threw: "no such method" })).toBe("");
  });
});
