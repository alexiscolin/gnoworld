import { Address, CallRequest } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { transaction } from "./call.ts";
import { record } from "./record.ts";

// Every source the app builds, as text: tests and stories are no build.
const SOURCES = import.meta.glob<string>(["../../**/*.{ts,tsx}", "!../../**/*.{test,stories}.*"], {
  query: "?raw",
  import: "default",
  eager: true,
});
// The recording page, as text: it runs in Alexis's browser, with his Adena, not in a test.
const PAGE = (await import("../../../recording/index.html?raw")).default;
const CALLER = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const ONYX = { chainId: "onyx-1", name: "Onyx", rpc: "https://rpc.onyx.testnets.gno.land:443" };
const REQUEST = CallRequest.parse({
  chainId: "onyx-1",
  caller: CALLER,
  realm: "gno.land/r/demo/counter",
  func: "Increment",
  args: [],
});

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
      { call: "DoContract", args: [transaction(REQUEST, ONYX)] },
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

  it("has the page connect first, and refuse to call while it knows no account (F5645)", () => {
    expect(PAGE).toContain('call: "AddEstablish"');
    expect(PAGE).toMatch(/if \(account === ""\) return/);
    expect(PAGE).not.toContain('caller: ""');
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
