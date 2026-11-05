import { Address, CallRequest } from "@gnoworld/schemas";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { connect, signLogin } from "./adena.ts";
import { callContract } from "./call.ts";
import recording from "../../../recording/adena-recording.json" with { type: "json" };

const CALLER = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const OTHER = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const ONYX = { chainId: "onyx-1", name: "Onyx", rpc: "https://rpc.onyx.testnets.gno.land:443" };
const REQUEST = CallRequest.parse({
  chainId: "onyx-1",
  caller: CALLER,
  realm: "gno.land/r/demo/counter",
  func: "Increment",
  args: ["1"],
});

// Adena's answers as the SDK types them (@adena-wallet/sdk 0.1.1: bin/index.d.ts:556-681, codes at bin/index.js:785-985).
const answer = (status: string, type: string, data: unknown = {}) =>
  Promise.resolve({ code: status === "success" ? 0 : 4001, status, type, message: "", data });
const ok = (type: string, data: unknown) => answer("success", type, data);
const CODES: Record<string, number> = {
  NOT_CONNECTED: 1000,
  UNRESOLVED_TRANSACTION_EXISTS: 1001,
  INVALID_FORMAT: 1002,
  WALLET_LOCKED: 2000,
  ACCOUNT_MISMATCH: 3001,
  NO_ACCOUNT: 3002,
  TRANSACTION_REJECTED: 4000,
  SWITCH_NETWORK_REJECTED: 4000,
  ADD_NETWORK_REJECTED: 4000,
  CONNECTION_REJECTED: 4000,
  TRANSACTION_FAILED: 4001,
  UNADDED_NETWORK: 4001,
  UNSUPPORTED_TYPE: 4005,
  UNEXPECTED_ERROR: 9000,
};
// The message the SDK gives each type (bin/index.js:785-985): a failure carries it, so a result that must carry no log is proven.
const MESSAGES: Record<string, string> = {
  NOT_CONNECTED: "A connection has not been established.",
  UNRESOLVED_TRANSACTION_EXISTS: "An unresolved transaction pop-up exists.",
  INVALID_FORMAT: "The transaction is in an invalid format.",
  WALLET_LOCKED: "Adena is Locked.",
  ACCOUNT_MISMATCH: "The account does not match the caller.",
  NO_ACCOUNT: "No account found on Adena.",
  TRANSACTION_FAILED: "Adena could not execute the transaction.",
  REDUNDANT_CHANGE_REQUEST: "Unable to change to the current network.",
  UNADDED_NETWORK: "The network has not been added on Adena.",
  UNSUPPORTED_TYPE: "Adena does not support the requested transaction type.",
  UNEXPECTED_ERROR: "Adena has encountered an unexpected error.",
  TRANSACTION_REJECTED: "The transaction has been rejected by the user.",
  SIGN_REJECTED: "The signature has been rejected by the user.",
  CONNECTION_REJECTED: "The connection request has been rejected by the user.",
  SWITCH_NETWORK_REJECTED: "Switching the network has been rejected by the user.",
  ADD_NETWORK_REJECTED: "Adding a network has been rejected by the user.",
};
const no = (type: string, message = MESSAGES[type] ?? "") =>
  Promise.resolve({ code: CODES[type] ?? 4001, status: "failure", type, message, data: {} });

// DoContract's success as Adena answered Alexis on Onyx (app/recording/adena-recording.json, D209): a hex hash and
// the realm's Log, no height, no check_tx or deliver_tx, whatever the SDK's types say. By place: 3 is the signed
// call, 4 was signed by mistake under the label "call, rejected", 5 is the refusal.
const SENT = {
  error: null,
  data: null,
  Log: "counter is 1",
  hash: "785c189e582beca7c3bccb26afa9ed679bc2a1efc97072dd744d29ce2f83d058",
};
const SIGNED = { ok: true, hash: SENT.hash, log: "counter is 1" };
const recorded = (at: number) => recording[at]?.answer;

type Method = ((...args: unknown[]) => unknown) | undefined;
// An extension with state: the chain it is on, the networks it knows, the account. It records what it was asked.
class Fake {
  asked: { call: string; args: unknown[] }[] = [];
  chain: string;
  known: Set<string>;
  account = CALLER as string;
  connected = true;
  version = "1.23.0";
  over: Record<string, Method>;
  constructor(over: Record<string, Method> = {}, chain = "onyx-1", known = ["onyx-1", "gnoland-1"]) {
    this.over = over;
    this.chain = chain;
    this.known = new Set(known);
  }
  get names() {
    return this.asked.map((a) => a.call);
  }
  private run(name: string, args: unknown[], normal: () => unknown): unknown {
    this.asked.push({ call: name, args });
    const over = this.over[name];
    return over === undefined ? normal() : over(...args);
  }
  AddEstablish(...args: unknown[]) {
    return this.run("AddEstablish", args, () => {
      this.connected = true;
      return ok("CONNECTION_SUCCESS", {});
    });
  }
  GetAccount(...args: unknown[]) {
    return this.run("GetAccount", args, () =>
      this.connected
        ? ok("GET_ACCOUNT", { address: this.account, chainId: this.chain, accountNumber: "0", sequence: "0" })
        : no("NOT_CONNECTED"),
    );
  }
  GetNetwork(...args: unknown[]) {
    return this.run("GetNetwork", args, () =>
      ok("GET_NETWORK", { chainId: this.chain, networkName: this.chain, addressPrefix: "g", rpcUrl: "x" }),
    );
  }
  SwitchNetwork(...args: unknown[]) {
    return this.run("SwitchNetwork", args, () => {
      const [id] = args as [string];
      if (!this.known.has(id)) return no("UNADDED_NETWORK");
      this.chain = id;
      return ok("SWITCH_NETWORK_SUCCESS", { chainId: id });
    });
  }
  AddNetwork(...args: unknown[]) {
    return this.run("AddNetwork", args, () => {
      const [network] = args as [{ chainId: string }];
      this.known.add(network.chainId);
      return ok("ADD_NETWORK_SUCCESS", network);
    });
  }
  SignArbitrary(...args: unknown[]) {
    return this.run("SignArbitrary", args, () => no("SIGN_REJECTED"));
  }
  DoContract(...args: unknown[]) {
    return this.run("DoContract", args, () => ok("TRANSACTION_SUCCESS", SENT));
  }
}

// The one argument DoContract receives, whole: the message, the SDK's default gas and fee, the pinned network.
const params = (request: CallRequest, universe = ONYX) => [
  {
    messages: [
      {
        type: "/vm.m_call",
        value: {
          caller: request.caller,
          send: "",
          max_deposit: "",
          pkg_path: request.realm,
          func: request.func,
          args: request.args,
        },
      },
    ],
    gasFee: 1_000_000,
    gasWanted: 10_000_000,
    networkInfo: { chainId: universe.chainId, rpcUrl: universe.rpc },
  },
];
const [GA, GN, SN, AN] = ["GetAccount", "GetNetwork", "SwitchNetwork", "AddNetwork"];
const sent = (adena: Fake) => adena.asked.filter((a) => a.call === "DoContract");

describe("callContract: the way through", () => {
  it("checks the account and the network, then sends one DoContract, and answers with the hash and log", async () => {
    const adena = new Fake();
    expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual(SIGNED);
    expect(adena.names).toEqual(["GetAccount", "GetNetwork", "DoContract"]);
  });

  it("sends one MsgCall, the whole argument of DoContract and no other: no memo, no options, no coins", async () => {
    const adena = new Fake();
    const request = { ...REQUEST, args: ["1", "two", ""] };
    await callContract(adena, request, ONYX);
    expect(sent(adena)).toHaveLength(1);
    expect(sent(adena)[0]?.args).toEqual(params(request));
  });

  it("uses the SDK's default gas and fee, and pins the transaction to the universe's chain and node", async () => {
    const adena = new Fake();
    await callContract(adena, REQUEST, ONYX);
    expect(sent(adena)[0]?.args[0]).toMatchObject({
      gasWanted: 10_000_000,
      gasFee: 1_000_000,
      networkInfo: { chainId: "onyx-1", rpcUrl: ONYX.rpc },
    });
  });

  it("sends exactly the request, whatever it holds (property): one message, nothing the preview does not show", () => {
    const realms = ["gno.land/r/demo/counter", "gno.land/r/sys/namereg/v0", "gno.land/r/gnoland/home"];
    return fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...realms),
        fc.constantFrom("Increment", "Register", "Vote", "X"),
        fc.array(fc.string({ unit: "grapheme" }), { maxLength: 6 }),
        async (realm, func, graphemes) => {
          // The request refuses control and format characters (D231).
          const args = graphemes.map((text) => text.replace(/(?![\n\t])[\p{Cc}\p{Cf}]/gu, ""));
          const request = CallRequest.parse({ ...REQUEST, realm, func, args });
          const adena = new Fake();
          await callContract(adena, request, ONYX);
          expect(sent(adena)[0]?.args).toEqual(params(request));
        },
      ),
    );
  });
});

describe("callContract: a request that is not a CallRequest reaches no Adena call (F5642)", () => {
  // Typed objects built by hand, past the schema: the guard lives in the function that signs.
  const forged = (change: Record<string, unknown>) => ({ ...REQUEST, ...change });
  it.each([
    ["a package path", forged({ realm: "gno.land/p/demo/avl" })],
    ["an unexported function", forged({ func: "lower" })],
    ["an argument past 8,192 bytes", forged({ args: ["x".repeat(20_000)] })],
    ["a caller that is no address", forged({ caller: "" })],
    ["a field the request does not have", forged({ memo: "hi" })],
    ["no arguments array", forged({ args: undefined })],
  ])("%s", async (_, request) => {
    const adena = new Fake();
    expect(await callContract(adena, request, ONYX)).toStrictEqual({ ok: false, reason: "malformed" });
    expect(adena.names).toEqual([]);
  });
});

describe("callContract: the account", () => {
  it("connects first when gnoworld is not let in, then reads the account again", async () => {
    const adena = new Fake();
    adena.connected = false;
    expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual(SIGNED);
    expect(adena.names).toEqual(["GetAccount", "AddEstablish", "GetAccount", "GetNetwork", "DoContract"]);
    expect(adena.asked[1]?.args).toEqual(["gnoworld"]);
  });

  it("reads the state again after a connection that came back with no error: still not connected, nothing is sent", async () => {
    const adena = new Fake({ AddEstablish: () => ok("CONNECTION_SUCCESS", {}) });
    adena.connected = false;
    expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual({ ok: false, reason: "not-connected" });
    expect(adena.names).toEqual(["GetAccount", "AddEstablish", "GetAccount"]);
  });

  it("stops on a refused connection", async () => {
    const adena = new Fake({ AddEstablish: () => no("CONNECTION_REJECTED") });
    adena.connected = false;
    expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual({ ok: false, reason: "declined" });
    expect(adena.names).toEqual(["GetAccount", "AddEstablish"]);
  });

  it("stops when Adena is on another account than the call's caller: the person chose that account in gnoworld", async () => {
    const adena = new Fake();
    adena.account = OTHER;
    expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual({ ok: false, reason: "wrong-account" });
    expect(adena.names).toEqual(["GetAccount"]);
  });

  it.each([
    ["locked", "WALLET_LOCKED", "locked"],
    ["without an account", "NO_ACCOUNT", "no-account"],
  ])("stops when Adena is %s", async (_, type, reason) => {
    const adena = new Fake({ GetAccount: () => no(type) });
    expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual({ ok: false, reason });
    expect(adena.names).toEqual(["GetAccount"]);
  });
});

describe("callContract: a call on the wrong network is stopped before signing", () => {
  it("switches to the universe's chain, reads the network again, and only then sends", async () => {
    const adena = new Fake({}, "gnoland-1");
    expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual(SIGNED);
    expect(adena.names).toEqual(["GetAccount", "GetNetwork", "SwitchNetwork", "GetNetwork", "DoContract"]);
    expect(adena.asked[2]?.args).toEqual(["onyx-1"]);
  });

  it("adds the network from the universe's data when Adena does not know it, then switches, reads, and sends", async () => {
    const adena = new Fake({}, "gnoland-1", ["gnoland-1"]);
    expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual(SIGNED);
    expect(adena.names).toEqual([
      "GetAccount",
      "GetNetwork",
      "SwitchNetwork",
      "AddNetwork",
      "SwitchNetwork",
      "GetNetwork",
      "DoContract",
    ]);
    expect(adena.asked[3]?.args).toEqual([{ chainId: "onyx-1", chainName: "Onyx", rpcUrl: ONYX.rpc }]);
  });

  it("stops when Adena still is on another chain after the switch: no DoContract", async () => {
    const adena = new Fake({ SwitchNetwork: () => ok("SWITCH_NETWORK_SUCCESS", { chainId: "onyx-1" }) }, "gnoland-1");
    expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual({ ok: false, reason: "wrong-network" });
    expect(adena.names).toEqual(["GetAccount", "GetNetwork", "SwitchNetwork", "GetNetwork"]);
  });

  it("stops when it is still wrong after adding and switching", async () => {
    const adena = new Fake(
      { SwitchNetwork: () => no("UNADDED_NETWORK"), AddNetwork: () => ok("ADD_NETWORK_SUCCESS", {}) },
      "gnoland-1",
      [],
    );
    expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual({ ok: false, reason: "wrong-network" });
    expect(adena.names).toEqual(["GetAccount", "GetNetwork", "SwitchNetwork", "AddNetwork", "SwitchNetwork"]);
    expect(adena.names.filter((n) => n === "AddNetwork")).toHaveLength(1);
  });

  it.each([
    [
      "refuses the switch",
      { SwitchNetwork: () => no("SWITCH_NETWORK_REJECTED") },
      { reason: "declined", names: [GA, GN, SN] },
    ],
    [
      "refuses the add",
      { SwitchNetwork: () => no("UNADDED_NETWORK"), AddNetwork: () => no("ADD_NETWORK_REJECTED") },
      { reason: "declined", names: [GA, GN, SN, AN] },
    ],
    [
      "fails the switch",
      { SwitchNetwork: () => no("UNEXPECTED_ERROR") },
      { reason: "failed", names: [GA, GN, SN], log: MESSAGES["UNEXPECTED_ERROR"] },
    ],
    [
      "throws on the switch",
      { SwitchNetwork: () => Promise.reject(new Error("gone")) },
      { reason: "failed", names: [GA, GN, SN] },
    ],
  ])("stops, with no DoContract, when the person %s", async (_, over, expected) => {
    const { reason, names } = expected;
    const log = "log" in expected ? expected.log : undefined;
    const adena = new Fake(over, "gnoland-1", ["gnoland-1"]);
    expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual(
      log === undefined ? { ok: false, reason } : { ok: false, reason, log },
    );
    expect(adena.names).toEqual(names);
  });

  // After AddNetwork: the second switch is read as the first is, and a second GetNetwork that fails ends the call.
  it.each([
    ["is declined", () => no("SWITCH_NETWORK_REJECTED"), { reason: "declined", names: [GA, GN, SN, AN, SN] }],
    ["is unadded still", () => no("UNADDED_NETWORK"), { reason: "wrong-network", names: [GA, GN, SN, AN, SN] }],
    [
      "is redundant, the chain still wrong",
      () => no("REDUNDANT_CHANGE_REQUEST"),
      { reason: "wrong-network", names: [GA, GN, SN, AN, SN, GN] },
    ],
  ])("stops, with no DoContract, when the switch after the add %s", async (_, second, { reason, names }) => {
    let switches = 0;
    const adena = new Fake({ SwitchNetwork: () => (++switches === 1 ? no("UNADDED_NETWORK") : second()) }, "gnoland-1");
    expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual({ ok: false, reason });
    expect(adena.names).toEqual(names);
  });

  it("goes on after a second switch that is redundant when the chain read again is the universe's", async () => {
    let switches = 0;
    const adena: Fake = new Fake(
      {
        SwitchNetwork: () => {
          if (++switches === 1) return no("UNADDED_NETWORK");
          adena.chain = "onyx-1";
          return no("REDUNDANT_CHANGE_REQUEST");
        },
      },
      "gnoland-1",
      ["gnoland-1"],
    );
    expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual(SIGNED);
    expect(adena.names).toEqual([GA, GN, SN, AN, SN, GN, "DoContract"]);
  });

  // A success-status answer typed as a failure is malformed, whatever its type says (F5664): it ends the call.
  it.each(["REDUNDANT_CHANGE_REQUEST", "UNADDED_NETWORK"])(
    "stops, signing nothing, on a switch answered as a success typed %s",
    async (type) => {
      const adena = new Fake({ SwitchNetwork: () => answer("success", type) }, "gnoland-1");
      expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual({ ok: false, reason: "malformed" });
      expect(adena.names).toEqual([GA, GN, SN]);
    },
  );

  it.each(["REDUNDANT_CHANGE_REQUEST", "UNADDED_NETWORK"])(
    "stops, signing nothing, on the second switch answered as a success typed %s",
    async (type) => {
      let switches = 0;
      const adena = new Fake(
        { SwitchNetwork: () => (++switches === 1 ? no("UNADDED_NETWORK") : answer("success", type)) },
        "gnoland-1",
        ["gnoland-1"],
      );
      expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual({ ok: false, reason: "malformed" });
      expect(adena.names).toEqual([GA, GN, SN, AN, SN]);
    },
  );

  it("stops on a second GetNetwork that fails, after a switch: no DoContract", async () => {
    let reads = 0;
    const adena = new Fake(
      { GetNetwork: () => (++reads === 1 ? ok("GET_NETWORK", { chainId: "gnoland-1" }) : no("WALLET_LOCKED")) },
      "gnoland-1",
    );
    expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual({ ok: false, reason: "locked" });
    expect(adena.names).toEqual([GA, GN, SN, GN]);
  });

  it("stops on a redundant switch answer when the network read after it is still wrong", async () => {
    const adena = new Fake({ SwitchNetwork: () => no("REDUNDANT_CHANGE_REQUEST") }, "gnoland-1");
    const result = await callContract(adena, REQUEST, ONYX);
    expect(result).toEqual({ ok: false, reason: "wrong-network" });
    expect(adena.names).toEqual(["GetAccount", "GetNetwork", "SwitchNetwork", "GetNetwork"]);
  });

  it("stops on a network answer that fails its schema, with no DoContract", async () => {
    const adena = new Fake({ GetNetwork: () => ok("GET_NETWORK", { networkName: "no chain" }) });
    expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual({ ok: false, reason: "malformed" });
    expect(adena.names).toEqual(["GetAccount", "GetNetwork"]);
  });

  it("compares the whole chain id, not a prefix or a case: onyx-10 and ONYX-1 are other chains", async () => {
    for (const chain of ["onyx-10", "ONYX-1", "onyx-1 "]) {
      const adena = new Fake({ SwitchNetwork: () => ok("SWITCH_NETWORK_SUCCESS", {}) }, chain);
      expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual({ ok: false, reason: "wrong-network" });
      expect(adena.names).toEqual(["GetAccount", "GetNetwork", "SwitchNetwork", "GetNetwork"]);
    }
  });
});

describe("callContract: every failure is a state with its next step", () => {
  it.each([
    ["NOT_CONNECTED", "not-connected"],
    ["UNRESOLVED_TRANSACTION_EXISTS", "busy"],
    ["WALLET_LOCKED", "locked"],
    ["ACCOUNT_MISMATCH", "wrong-account"],
    ["NO_ACCOUNT", "no-account"],
    ["TRANSACTION_REJECTED", "declined"],
    ["TRANSACTION_FAILED", "failed"],
    ["UNSUPPORTED_TYPE", "unsupported"],
    ["INVALID_FORMAT", "failed"],
    ["UNEXPECTED_ERROR", "failed"],
    ["A_TYPE_NOBODY_KNOWS", "failed"],
  ])("DoContract's %s is the state %s", async (type, reason) => {
    const adena = new Fake({ DoContract: () => no(type) });
    const log = reason === "failed" ? MESSAGES[type] : undefined;
    expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual(
      log === undefined ? { ok: false, reason } : { ok: false, reason, log },
    );
  });

  it("takes a failed transaction's log from Adena's message", async () => {
    const adena = new Fake({ DoContract: () => no("TRANSACTION_FAILED", "out of gas in location") });
    expect(await callContract(adena, REQUEST, ONYX)).toEqual({
      ok: false,
      reason: "failed",
      log: "out of gas in location",
    });
  });

  it("is a failure, with its log, when the chain ran the transaction and the realm failed it", async () => {
    const data = { ...SENT, error: { "@type": "/vm.m_call_error" }, Log: "panic: not allowed" };
    const adena = new Fake({ DoContract: () => ok("TRANSACTION_SUCCESS", data) });
    expect(await callContract(adena, REQUEST, ONYX)).toEqual({
      ok: false,
      reason: "failed",
      log: "panic: not allowed",
    });
  });

  it("reads DoContract's two answers as Adena recorded them on Onyx: the signed call, and the refusal (D209)", async () => {
    const signed = new Fake({ DoContract: () => Promise.resolve(recorded(3)) });
    expect(await callContract(signed, REQUEST, ONYX)).toEqual({
      ok: true,
      hash: "785c189e582beca7c3bccb26afa9ed679bc2a1efc97072dd744d29ce2f83d058",
      log: "",
    });
    const refused = new Fake({ DoContract: () => Promise.resolve(recorded(5)) });
    expect(await callContract(refused, REQUEST, ONYX)).toStrictEqual({ ok: false, reason: "declined" });
  });

  it("reads GetAccount, GetNetwork and a switch to the chain it is on as Adena recorded them (D209)", async () => {
    const caller = Address.parse("g15wmukt79xymnnu6c4de32trnufudqum60yrxu8");
    let reads = 0;
    const adena = new Fake({
      GetAccount: () => Promise.resolve(recorded(0)),
      // First on another chain, so the recorded "already there" answer to the switch is read; then Onyx as recorded.
      GetNetwork: () => (++reads === 1 ? ok("GET_NETWORK", { chainId: "gnoland-1" }) : Promise.resolve(recorded(1))),
      SwitchNetwork: () => Promise.resolve(recorded(2)),
    });
    expect(await callContract(adena, { ...REQUEST, caller }, ONYX)).toStrictEqual(SIGNED);
    expect(adena.names).toEqual(["GetAccount", "GetNetwork", "SwitchNetwork", "GetNetwork", "DoContract"]);
  });

  it("says missing for no extension, and outdated for one with no DoContract", async () => {
    expect(await callContract(undefined, REQUEST, ONYX)).toStrictEqual({ ok: false, reason: "missing" });
    const old = { GetAccount: () => 1, GetNetwork: () => 1, AddEstablish: () => 1 };
    expect(await callContract(old, REQUEST, ONYX)).toStrictEqual({ ok: false, reason: "outdated" });
  });

  it.each([
    ["a call that rejects", () => Promise.reject(new Error("extension gone"))],
    [
      "a call that throws at once",
      () => {
        throw new Error("sync");
      },
    ],
  ])("is a result, never a rejection, for %s", async (_, doContract) => {
    expect(await callContract(new Fake({ DoContract: doContract }), REQUEST, ONYX)).toEqual({
      ok: false,
      reason: "failed",
    });
  });

  it("is a result for a getter that throws, on any method the call reads", async () => {
    for (const name of ["AddEstablish", "GetAccount", "GetNetwork", "DoContract"]) {
      const adena = Object.defineProperty(new Fake(), name, {
        get(): never {
          throw new Error("trap");
        },
      });
      expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual({ ok: false, reason: "failed" });
    }
  });

  it("is a result for a proxy whose every trap throws", async () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("get");
        },
        has() {
          throw new Error("has");
        },
        getPrototypeOf() {
          throw new Error("proto");
        },
      },
    );
    expect(await callContract(hostile, REQUEST, ONYX)).toStrictEqual({ ok: false, reason: "failed" });
  });

  it("is not blocked by an old version: no version floor for a call, the network is read before signing (D204)", async () => {
    const adena = new Fake();
    adena.version = "0.1.0";
    expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual(SIGNED);
  });

  // Adena's own codes name a type nobody knows (the SDK's table, bin/index.js:785-985); a known type decides.
  it.each([
    [1000, "not-connected"],
    [1001, "busy"],
    [2000, "locked"],
    [3001, "wrong-account"],
    [3002, "no-account"],
    [4000, "declined"],
    [4001, "failed"],
    [4005, "unsupported"],
    [9000, "failed"],
    [12345, "failed"],
  ])("an unknown type with the code %i is the state %s", async (code, reason) => {
    const adena = new Fake({
      DoContract: () =>
        Promise.resolve({ code, status: "failure", type: "A_TYPE_NOBODY_KNOWS", message: "", data: {} }),
    });
    expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual({ ok: false, reason });
  });

  it("lets the type decide when the code disagrees: TRANSACTION_FAILED with the code 1001 is failed, not busy", async () => {
    const adena = new Fake({
      DoContract: () =>
        Promise.resolve({ code: 1001, status: "failure", type: "TRANSACTION_FAILED", message: "", data: {} }),
    });
    expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual({ ok: false, reason: "failed" });
  });

  it("keeps a log of 2,048 characters whole and cuts one past it to 2,048, in a failure and in a success", async () => {
    const at = "a".repeat(2048);
    const past = `${at}b`;
    const failed = (message: string) => new Fake({ DoContract: () => no("TRANSACTION_FAILED", message) });
    expect(await callContract(failed(at), REQUEST, ONYX)).toStrictEqual({ ok: false, reason: "failed", log: at });
    expect(await callContract(failed(past), REQUEST, ONYX)).toStrictEqual({ ok: false, reason: "failed", log: at });
    const sentLog = (Log: string) => new Fake({ DoContract: () => ok("TRANSACTION_SUCCESS", { ...SENT, Log }) });
    expect(await callContract(sentLog(at), REQUEST, ONYX)).toMatchObject({ ok: true, log: at });
    expect(await callContract(sentLog(past), REQUEST, ONYX)).toMatchObject({ ok: true, log: at });
  });

  it("returns the log and not the chain's returned value: the card reads the result from the hash (D205)", async () => {
    const data = { ...SENT, data: "aGVsbG8=" };
    const adena = new Fake({ DoContract: () => ok("TRANSACTION_SUCCESS", data) });
    expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual(SIGNED);
  });

  it("is malformed for a success with no error key: Adena always sends one, null when all went well", async () => {
    const data = { hash: SENT.hash, Log: "counter is 1" };
    const adena = new Fake({ DoContract: () => ok("TRANSACTION_SUCCESS", data) });
    expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual({ ok: false, reason: "malformed" });
  });

  it("takes a hash in capitals, as hex may be written", async () => {
    const data = { ...SENT, hash: SENT.hash.toUpperCase() };
    const adena = new Fake({ DoContract: () => ok("TRANSACTION_SUCCESS", data) });
    expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual({ ...SIGNED, hash: data.hash });
  });
});

describe("callContract: Adena's answers that fail their schema become an error state", () => {
  const sentWith = (change: Record<string, unknown>) => () => ok("TRANSACTION_SUCCESS", { ...SENT, ...change });
  it.each([
    ["nothing", () => Promise.resolve(undefined)],
    ["a string", () => Promise.resolve("sent")],
    ["a success of another type", () => ok("SIGN_ARBITRARY", SENT)],
    ["a failure that says it was sent", () => answer("failure", "TRANSACTION_SUCCESS", SENT)],
    ["a success typed TRANSACTION_SENT, which Adena does not answer", () => ok("TRANSACTION_SENT", SENT)],
    ["no data", () => ok("TRANSACTION_SUCCESS", undefined)],
    ["data that is a string", () => ok("TRANSACTION_SUCCESS", "hash")],
    ["no hash", sentWith({ hash: undefined })],
    ["an empty hash", sentWith({ hash: "" })],
    ["a hash with a path in it", sentWith({ hash: "a/../b?x=1" })],
    ["a hash that is markup", sentWith({ hash: "<script>" })],
    ["a hash of the wrong length", sentWith({ hash: SENT.hash.slice(1) })],
    ["a hash one digit too long", sentWith({ hash: `${SENT.hash}0` })],
    ["a hash of a million characters", sentWith({ hash: "a".repeat(1_000_000) })],
    ["a hash with a character outside hex", sentWith({ hash: `${SENT.hash.slice(1)}g` })],
    [
      "a hash in base64, as the SDK's types have it",
      sentWith({ hash: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=" }),
    ],
    ["a hash that is no string", sentWith({ hash: 12 })],
    ["no Log", sentWith({ Log: undefined })],
    ["a Log that is no string", sentWith({ Log: 1 })],
  ])("%s", async (_, doContract) => {
    expect(await callContract(new Fake({ DoContract: doContract }), REQUEST, ONYX)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });
});

describe("callContract: a second request waits for the first", () => {
  it("asks Adena nothing for the second until the first's DoContract has answered", async () => {
    const started = Promise.withResolvers<undefined>();
    const gate = Promise.withResolvers<undefined>();
    const adena = new Fake({
      DoContract: async () => {
        started.resolve(undefined);
        await gate.promise;
        return ok("TRANSACTION_SUCCESS", SENT);
      },
    });
    const first = callContract(adena, REQUEST, ONYX);
    const second = callContract(adena, { ...REQUEST, func: "Decrement" }, ONYX);
    await started.promise;
    expect(adena.names).toEqual(["GetAccount", "GetNetwork", "DoContract"]);
    gate.resolve(undefined);
    expect(await first).toMatchObject({ ok: true });
    expect(await second).toMatchObject({ ok: true });
    expect(adena.names).toEqual(["GetAccount", "GetNetwork", "DoContract", "GetAccount", "GetNetwork", "DoContract"]);
  });

  it("goes on with the second after a first that failed", async () => {
    let calls = 0;
    const adena = new Fake({
      DoContract: () => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error("popup closed")) : ok("TRANSACTION_SUCCESS", SENT);
      },
    });
    const first = callContract(adena, REQUEST, ONYX);
    const second = callContract(adena, REQUEST, ONYX);
    expect(await first).toMatchObject({ ok: false });
    expect(await second).toMatchObject({ ok: true });
  });
});

describe("callContract: the request's chain is the universe's", () => {
  it("refuses a request for another chain than the universe's, asking Adena nothing", async () => {
    const adena = new Fake({}, "gnoland-1");
    expect(await callContract(adena, { ...REQUEST, chainId: "gnoland-1" }, ONYX)).toEqual({
      ok: false,
      reason: "wrong-network",
    });
    expect(adena.asked).toEqual([]);
  });
});

describe("callContract: Adena's other answers fail their schema or their code", () => {
  const account = (data: unknown) => ({ GetAccount: () => ok("GET_ACCOUNT", data) });
  const good = { address: CALLER, chainId: "onyx-1" };

  it.each([
    ["nothing", undefined],
    ["a string", "g1x"],
    ["a non-address", { ...good, address: "not an address" }],
    ["an address in capitals", { ...good, address: CALLER.toUpperCase() }],
    ["no address", { chainId: "onyx-1" }],
    ["no chain", { address: CALLER }],
  ])("a GetAccount with %s is malformed, with no DoContract", async (_, data) => {
    const adena = new Fake(account(data));
    expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual({ ok: false, reason: "malformed" });
    expect(adena.names).toEqual(["GetAccount"]);
  });

  it.each([
    ["WALLET_LOCKED", "locked"],
    ["NO_ACCOUNT", "no-account"],
    ["UNRESOLVED_TRANSACTION_EXISTS", "busy"],
    ["UNEXPECTED_ERROR", "failed"],
  ])("a GetNetwork that fails with %s is the state %s, with no DoContract", async (type, reason) => {
    const adena = new Fake({ GetNetwork: () => no(type) });
    const log = reason === "failed" ? MESSAGES[type] : undefined;
    expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual(
      log === undefined ? { ok: false, reason } : { ok: false, reason, log },
    );
    expect(adena.names).toEqual(["GetAccount", "GetNetwork"]);
  });

  it("a GetNetwork that rejects, or answers nothing, is a result with no DoContract", async () => {
    const rejects = new Fake({ GetNetwork: () => Promise.reject(new Error("gone")) });
    expect(await callContract(rejects, REQUEST, ONYX)).toStrictEqual({ ok: false, reason: "failed" });
    const nothing = new Fake({ GetNetwork: () => Promise.resolve(undefined) });
    expect(await callContract(nothing, REQUEST, ONYX)).toStrictEqual({ ok: false, reason: "malformed" });
    expect(rejects.names).toEqual([GA, GN]);
    expect(nothing.names).toEqual([GA, GN]);
  });

  it.each([
    ["UNRESOLVED_TRANSACTION_EXISTS", "busy"],
    ["WALLET_LOCKED", "locked"],
    ["NO_ACCOUNT", "no-account"],
  ])("a SwitchNetwork that fails with %s is the state %s, with no DoContract", async (type, reason) => {
    const adena = new Fake({ SwitchNetwork: () => no(type) }, "gnoland-1");
    expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual({ ok: false, reason });
    expect(adena.names).toEqual(["GetAccount", "GetNetwork", "SwitchNetwork"]);
  });

  it("a SwitchNetwork that answers nothing is malformed, with no DoContract", async () => {
    const adena = new Fake({ SwitchNetwork: () => Promise.resolve(undefined) }, "gnoland-1");
    expect(await callContract(adena, REQUEST, ONYX)).toStrictEqual({ ok: false, reason: "malformed" });
    expect(adena.names).toEqual(["GetAccount", "GetNetwork", "SwitchNetwork"]);
  });
});

describe("callContract: an extension too old for the step it needs", () => {
  const METHODS = ["AddEstablish", "GetAccount", "GetNetwork", "SwitchNetwork", "AddNetwork", "DoContract"];
  // The fake with some methods taken away: an extension that predates them.
  const without = (fake: Fake, ...names: string[]) =>
    Object.fromEntries(
      METHODS.filter((name) => !names.includes(name)).map((name) => [
        name,
        (...args: unknown[]): unknown => Reflect.apply(Reflect.get(fake, name) as () => unknown, fake, args),
      ]),
    );

  it.each([
    ["GetNetwork", [], "onyx-1"],
    ["GetAccount", [], "onyx-1"],
    ["SwitchNetwork", [], "gnoland-1"],
  ])("with no %s is outdated, and no DoContract is sent", async (name, _, chain) => {
    const fake = new Fake({}, chain);
    expect(await callContract(without(fake, name), REQUEST, ONYX)).toStrictEqual({ ok: false, reason: "outdated" });
    expect(sent(fake)).toEqual([]);
  });

  it("with no AddNetwork is outdated when the network is unknown to Adena", async () => {
    const fake = new Fake({}, "gnoland-1", ["gnoland-1"]);
    expect(await callContract(without(fake, "AddNetwork"), REQUEST, ONYX)).toEqual({
      ok: false,
      reason: "outdated",
    });
    expect(sent(fake)).toEqual([]);
  });

  it("sends with no SwitchNetwork and no AddNetwork when Adena is already on the chain: they are not needed", async () => {
    const fake = new Fake();
    expect(await callContract(without(fake, "SwitchNetwork", "AddNetwork"), REQUEST, ONYX)).toMatchObject({
      ok: true,
    });
  });
});

describe("callContract: one request at a time, whoever asks Adena", () => {
  const LOGIN = { address: CALLER, chainId: "onyx-1", text: "Sign in to gnoworld" };

  it("keeps a call's questions back until a login's signature has answered", async () => {
    const started = Promise.withResolvers<undefined>();
    const gate = Promise.withResolvers<undefined>();
    const adena = new Fake({
      SignArbitrary: async () => {
        started.resolve(undefined);
        await gate.promise;
        return no("SIGN_REJECTED");
      },
    });
    const login = signLogin(adena, LOGIN);
    const call = callContract(adena, REQUEST, ONYX);
    await started.promise;
    expect(adena.names).toEqual(["SignArbitrary"]);
    gate.resolve(undefined);
    expect(await login).toEqual({ ok: false, reason: "declined" });
    expect(await call).toMatchObject({ ok: true });
    expect(adena.names).toEqual(["SignArbitrary", "GetAccount", "GetNetwork", "DoContract"]);
  });

  it("keeps a call's questions back until a connection has answered", async () => {
    const started = Promise.withResolvers<undefined>();
    const gate = Promise.withResolvers<undefined>();
    const adena = new Fake({
      AddEstablish: async () => {
        started.resolve(undefined);
        await gate.promise;
        return ok("CONNECTION_SUCCESS", {});
      },
    });
    const connection = connect(adena);
    const call = callContract(adena, REQUEST, ONYX);
    await started.promise;
    expect(adena.names).toEqual(["AddEstablish"]);
    gate.resolve(undefined);
    expect(await connection).toMatchObject({ ok: true });
    expect(await call).toMatchObject({ ok: true });
  });

  it("keeps a login's signature back until a call's DoContract has answered", async () => {
    const started = Promise.withResolvers<undefined>();
    const gate = Promise.withResolvers<undefined>();
    const adena = new Fake({
      DoContract: async () => {
        started.resolve(undefined);
        await gate.promise;
        return ok("TRANSACTION_SUCCESS", SENT);
      },
    });
    const call = callContract(adena, REQUEST, ONYX);
    const login = signLogin(adena, LOGIN);
    await started.promise;
    expect(adena.names).not.toContain("SignArbitrary");
    gate.resolve(undefined);
    expect(await call).toMatchObject({ ok: true });
    expect(await login).toMatchObject({ ok: false });
    expect(adena.names.at(-1)).toBe("SignArbitrary");
  });
});
