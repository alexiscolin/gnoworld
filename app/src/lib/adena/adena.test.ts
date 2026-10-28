import { Address } from "@gnoworld/schemas";
import { describe, expect, it, vi } from "vitest";
import { connect, MAX_TEXT_BYTES, pageAdena, signLogin } from "./adena.ts";

const ADDRESS = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const OTHER = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const TEXT = "gnoworld.example wants you to sign in with your gno account.\n\nNonce: abc";
// What the server asked, on the chain Adena is on.
const login = (text: string) => ({ address: ADDRESS, chainId: "onyx-1", text });

// Adena's answers as the SDK's table writes them (@adena-wallet/sdk 0.1.1, bin/index.js:636-990): a status, a type,
// a code. "Already connected" comes as a failure, and the SDK reads it as connected (bin/index.js:1713).
const answer = (status: string, type: string, data: unknown = {}) =>
  Promise.resolve({ code: 0, status, type, message: "", data });
const ok = (type: string, data: unknown) => answer("success", type, data);
// A failure with the code the SDK's table gives its type (bin/index.js:790-990).
const CODES: Record<string, number> = {
  WALLET_LOCKED: 2000,
  NO_ACCOUNT: 3002,
  ACCOUNT_MISMATCH: 3001,
  NOT_CONNECTED: 1000,
  INVALID_FORMAT: 1002,
  SIGN_FAILED: 4001,
  ALREADY_CONNECTED: 4001,
  UNEXPECTED_ERROR: 9000,
};
const no = (type: string) =>
  Promise.resolve({ code: CODES[type] ?? 4000, status: "failure", type, message: "", data: {} });

const ACCOUNT = {
  address: ADDRESS,
  chainId: "onyx-1",
  accountNumber: "0",
  coins: "",
  sequence: "0",
  status: "ACTIVE",
  publicKey: null,
};
const NETWORK = {
  chainId: "onyx-1",
  networkName: "Onyx",
  addressPrefix: "g",
  rpcUrl: "https://rpc.invalid",
  indexerUrl: null,
};

// Base64 of a text's UTF-8 bytes, as the sign document holds it.
const base64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));
// The proof of what was asked: the ADR-036 document the SDK's makeArbitrarySignDoc builds, and a signature.
const proofOf = (data: string, signer: string = ADDRESS, chain = "onyx-1") => ({
  signed: {
    chain_id: chain,
    account_number: "0",
    sequence: "0",
    fee: { amount: [], gas: "0" },
    msgs: [{ type: "sign/MsgSignData", value: { signer, data: base64(data) } }],
    memo: "",
  },
  signature: { pubKey: { typeUrl: "/tm.PubKeySecp256k1", value: "A".repeat(44) }, signature: "A".repeat(88) },
});

// A wallet as a class, its methods using `this`, as the extension's are called (adena.GetAccount()); it
// answers as told and records what it was asked. SignArbitrary signs what it is given unless told otherwise.
class Wallet {
  asked: { call: string; args: unknown[] }[] = [];
  answers: Record<string, ((...args: unknown[]) => unknown) | undefined>;
  constructor(over: Record<string, ((...args: unknown[]) => unknown) | undefined> = {}) {
    this.answers = {
      AddEstablish: () => ok("CONNECTION_SUCCESS", {}),
      GetAccount: () => ok("GET_ACCOUNT", ACCOUNT),
      GetNetwork: () => ok("GET_NETWORK", NETWORK),
      SignArbitrary: (params) => {
        const { data, signer } = params as { data: string; signer: string };
        return ok("SIGN_ARBITRARY", proofOf(data, signer));
      },
      ...over,
    };
  }
  private call(name: string, args: unknown[]): unknown {
    this.asked.push({ call: name, args });
    const answering = this.answers[name];
    if (answering === undefined) throw new TypeError(`${name} is not a function`);
    return answering(...args);
  }
  AddEstablish(...args: unknown[]) {
    return this.call("AddEstablish", args);
  }
  GetAccount(...args: unknown[]) {
    return this.call("GetAccount", args);
  }
  GetNetwork(...args: unknown[]) {
    return this.call("GetNetwork", args);
  }
  get SignArbitrary() {
    return this.answers["SignArbitrary"] === undefined
      ? undefined
      : (...args: unknown[]) => this.call("SignArbitrary", args);
  }
}

describe("connect", () => {
  it("asks Adena to let gnoworld in, then reads its account and the network it is on", async () => {
    const adena = new Wallet();
    expect(await connect(adena)).toEqual({ ok: true, address: ADDRESS, chainId: "onyx-1" });
    expect(adena.asked.map((a) => a.call)).toEqual(["AddEstablish", "GetAccount", "GetNetwork"]);
    expect(adena.asked[0]?.args).toEqual(["gnoworld"]);
  });

  it("takes a site Adena already let in, though the SDK's table calls it a failure", async () => {
    expect(await connect(new Wallet({ AddEstablish: () => no("ALREADY_CONNECTED") }))).toMatchObject({
      ok: true,
    });
  });

  it("takes the network's answer under either name the SDK gives it", async () => {
    expect(await connect(new Wallet({ GetNetwork: () => ok("GET_NETWORK_SUCCESS", NETWORK) }))).toMatchObject({
      ok: true,
    });
  });

  it.each([
    ["nothing", undefined],
    ["null", null],
    ["an empty object", {}],
    ["a string", "adena"],
    ["a method that is no function", { AddEstablish: "x", GetAccount: () => 1, GetNetwork: () => 1 }],
    ["half a wallet", { AddEstablish: () => 1 }],
  ])("finds no Adena in %s", async (_, adena) => {
    expect(await connect(adena)).toEqual({ ok: false, reason: "missing" });
  });

  it.each([
    ["the person refuses gnoworld", { AddEstablish: () => no("CONNECTION_REJECTED") }, "declined"],
    ["Adena is locked as it is asked in", { AddEstablish: () => no("WALLET_LOCKED") }, "locked"],
    ["Adena is locked", { GetAccount: () => no("WALLET_LOCKED") }, "locked"],
    ["Adena holds no account", { GetAccount: () => no("NO_ACCOUNT") }, "no-account"],
    ["its network is locked", { GetNetwork: () => no("WALLET_LOCKED") }, "locked"],
    ["its network has no account", { GetNetwork: () => no("NO_ACCOUNT") }, "no-account"],
    ["the site is not let in", { GetAccount: () => no("NOT_CONNECTED") }, "failed"],
    ["Adena fails on its side", { GetAccount: () => no("UNEXPECTED_ERROR") }, "failed"],
    ["a call rejects", { GetAccount: () => Promise.reject(new Error("extension gone")) }, "failed"],
    [
      "a call throws before any promise",
      {
        GetAccount: () => {
          throw new Error("sync");
        },
      },
      "failed",
    ],
    ["an answer of another shape", { GetAccount: () => Promise.resolve({ weird: true }) }, "malformed"],
    ["an answer that is a string", { AddEstablish: () => Promise.resolve("ok") }, "malformed"],
    ["no answer at all", { AddEstablish: () => Promise.resolve(undefined) }, "malformed"],
    [
      "a success whose type says locked",
      { GetAccount: () => answer("success", "WALLET_LOCKED", ACCOUNT) },
      "malformed",
    ],
    ["a failure whose type says success", { GetAccount: () => answer("failure", "GET_ACCOUNT", ACCOUNT) }, "malformed"],
    ["an account with no address", { GetAccount: () => ok("GET_ACCOUNT", { chainId: "onyx-1" }) }, "malformed"],
    ["an address that is no string", { GetAccount: () => ok("GET_ACCOUNT", { ...ACCOUNT, address: 7 }) }, "malformed"],
    ["a network with no chain", { GetNetwork: () => ok("GET_NETWORK", { networkName: "x" }) }, "malformed"],
    [
      "a network with an empty chain",
      { GetNetwork: () => ok("GET_NETWORK", { ...NETWORK, chainId: "" }) },
      "malformed",
    ],
    ["a chain of blanks", { GetNetwork: () => ok("GET_NETWORK", { ...NETWORK, chainId: "   " }) }, "malformed"],
    [
      "a chain of blanks that the account names too",
      {
        GetAccount: () => ok("GET_ACCOUNT", { ...ACCOUNT, chainId: "   " }),
        GetNetwork: () => ok("GET_NETWORK", { ...NETWORK, chainId: "   " }),
      },
      "malformed",
    ],
    [
      "an empty chain that the account names too",
      {
        GetAccount: () => ok("GET_ACCOUNT", { ...ACCOUNT, chainId: "" }),
        GetNetwork: () => ok("GET_NETWORK", { ...NETWORK, chainId: "" }),
      },
      "malformed",
    ],
    [
      "a chain past the server's limit that the account names too",
      {
        GetAccount: () => ok("GET_ACCOUNT", { ...ACCOUNT, chainId: "c".repeat(51) }),
        GetNetwork: () => ok("GET_NETWORK", { ...NETWORK, chainId: "c".repeat(51) }),
      },
      "malformed",
    ],
    [
      "a chain longer than the server takes",
      { GetNetwork: () => ok("GET_NETWORK", { ...NETWORK, chainId: "c".repeat(51) }) },
      "malformed",
    ],
    [
      "an account on another chain than the network",
      { GetAccount: () => ok("GET_ACCOUNT", { ...ACCOUNT, chainId: "gnoland-1" }) },
      "malformed",
    ],
  ])("says so when %s", async (_, over, reason) => {
    expect(await connect(new Wallet(over))).toEqual({ ok: false, reason });
  });

  // Each reason the schema gives, written out here (F674).
  it.each([
    ["", "empty"],
    ["G1JG8MTUTU9KHHFWC4NXMUHCPFTF0PAJDHFVSQF5", "case"],
    ["cosmos1abc", "prefix"],
    ["g1jg8mtutu9khhfwc4nxmuhcpftfopajdhfvsqf5", "characters"],
    ["g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsq", "length"],
    ["g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf6", "checksum"],
  ])("says why Adena's address %j is no gno address: %s", async (address, problem) => {
    const adena = new Wallet({ GetAccount: () => ok("GET_ACCOUNT", { ...ACCOUNT, address }) });
    expect(await connect(adena)).toEqual({ ok: false, reason: "address", problem });
  });

  it("stops at the first refusal, asking nothing after it", async () => {
    const adena = new Wallet({ AddEstablish: () => no("CONNECTION_REJECTED") });
    await connect(adena);
    expect(adena.asked.map((a) => a.call)).toEqual(["AddEstablish"]);
  });

  describe("a hostile wallet never makes it throw", () => {
    const throwing = (name: string) =>
      Object.defineProperty(
        {
          AddEstablish: () => ok("CONNECTION_SUCCESS", {}),
          GetAccount: () => ok("GET_ACCOUNT", ACCOUNT),
          GetNetwork: () => ok("GET_NETWORK", NETWORK),
        },
        name,
        {
          get() {
            throw new Error("trap");
          },
        },
      );
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    const everything = new Proxy(
      {},
      { get: () => () => Promise.resolve({ status: "success", type: "GET_ACCOUNT", data: {} }) },
    );
    const trapped = new Proxy(
      {},
      {
        has() {
          throw new Error("trap");
        },
        ownKeys() {
          throw new Error("trap");
        },
        get() {
          throw new Error("trap");
        },
      },
    );
    let reads = 0;
    const vanishing = {
      get AddEstablish() {
        reads += 1;
        return reads === 1 ? () => ok("CONNECTION_SUCCESS", {}) : undefined;
      },
      GetAccount: () => ok("GET_ACCOUNT", ACCOUNT),
      GetNetwork: () => ok("GET_NETWORK", NETWORK),
    };
    const poisoned = new Wallet({
      GetAccount: () =>
        Promise.resolve({
          status: "success",
          type: "GET_ACCOUNT",
          get data() {
            throw new Error("trap");
          },
        }),
    });

    it.each([
      ["a getter that throws for AddEstablish", throwing("AddEstablish"), ["missing", "failed"]],
      ["a getter that throws for GetAccount", throwing("GetAccount"), ["missing", "failed"]],
      ["a revoked proxy", revoked.proxy, ["missing", "failed"]],
      ["a proxy whose every key is a function", everything, ["malformed"]],
      ["a proxy whose every trap throws", trapped, ["missing", "failed"]],
      ["a method there once and gone the next read", vanishing, ["ok"]],
      ["an answer whose data throws", poisoned, ["failed", "malformed"]],
    ])("%s: a result, never a rejection", async (_, adena, allowed) => {
      const result = await connect(adena);
      expect(allowed).toContain(result.ok ? "ok" : result.reason);
    });
  });
});

describe("signLogin", () => {
  it("has Adena sign the server's text unchanged, as the account it read, and gives the parsed proof", async () => {
    const adena = new Wallet();
    expect(await signLogin(adena, login(TEXT))).toEqual({ ok: true, proof: proofOf(TEXT) });
    expect(adena.asked).toEqual([{ call: "SignArbitrary", args: [{ signer: ADDRESS, data: TEXT }] }]);
  });

  // Nothing trims, folds or normalises the text: Adena gets these very characters (decision 141).
  it.each([
    ["spaces around", "  Sign in  "],
    ["a CRLF", "Sign\r\nin"],
    ["a tab", "Sign\tin"],
    ["a decomposed é", "Sign in, café"],
    ["an emoji", "Sign in 🦦"],
    ["a trailing newline", "Sign in\n"],
  ])("passes a text with %s as it is", async (_, text) => {
    const adena = new Wallet();
    expect(await signLogin(adena, login(text))).toMatchObject({ ok: true });
    const params = adena.asked[0]?.args[0];
    expect(params).toEqual({ signer: ADDRESS, data: text });
    expect(Object.is((params as { data: unknown } | undefined)?.data, text)).toBe(true);
  });

  it("gives a copy of the proof, its unknown keys dropped, that the wallet cannot change after", async () => {
    const proof = { ...proofOf(TEXT), extra: 1, signed: { ...proofOf(TEXT).signed, evil: true } };
    const adena = new Wallet({ SignArbitrary: () => ok("SIGN_ARBITRARY", proof) });
    const result = await signLogin(adena, login(TEXT));
    expect(result).toEqual({ ok: true, proof: proofOf(TEXT) });
    proof.signed.memo = "changed";
    expect(result).toEqual({ ok: true, proof: proofOf(TEXT) });
  });

  // The proof must be of what was asked: else the challenge is spent on a proof the server refuses.
  it.each([
    ["another signer", proofOf(TEXT, OTHER)],
    ["another chain", proofOf(TEXT, ADDRESS, "gnoland-1")],
    ["another text", proofOf(`${TEXT} `)],
    [
      "two messages",
      {
        ...proofOf(TEXT),
        signed: { ...proofOf(TEXT).signed, msgs: [...proofOf(TEXT).signed.msgs, ...proofOf(TEXT).signed.msgs] },
      },
    ],
    ["no message", { ...proofOf(TEXT), signed: { ...proofOf(TEXT).signed, msgs: [] } }],
    [
      "a message of another type",
      {
        ...proofOf(TEXT),
        signed: {
          ...proofOf(TEXT).signed,
          msgs: [{ type: "bank/MsgSend", value: { signer: ADDRESS, data: base64(TEXT) } }],
        },
      },
    ],
  ])("says the proof does not match when it carries %s", async (_, proof) => {
    const adena = new Wallet({ SignArbitrary: () => ok("SIGN_ARBITRARY", proof) });
    expect(await signLogin(adena, login(TEXT))).toEqual({ ok: false, reason: "mismatch" });
  });

  it.each([["no SignArbitrary", { SignArbitrary: undefined }]])(
    "says Adena is too old when it has %s",
    async (_, over) => {
      expect(await signLogin(new Wallet(over), login(TEXT))).toEqual({ ok: false, reason: "outdated" });
    },
  );

  it.each([
    ["a string", "x"],
    ["null", null],
  ])("says Adena is too old when its SignArbitrary is %s", async (_, value) => {
    const adena = { AddEstablish: () => 1, GetAccount: () => 1, GetNetwork: () => 1, SignArbitrary: value };
    expect(await signLogin(adena, login(TEXT))).toEqual({ ok: false, reason: "outdated" });
  });

  it.each([undefined, null, {}])("finds no Adena in %j", async (adena) => {
    expect(await signLogin(adena, login(TEXT))).toEqual({ ok: false, reason: "missing" });
  });

  // Adena carries 4096 bytes of UTF-8 at most (MAX_ARBITRARY_MESSAGE_BYTES, the SDK's index.d.ts:360).
  it.each([
    ["ASCII", "a", 4096],
    ["three-byte €", "€", 1365],
    ["four-byte 😀", "😀", 1024],
  ])("takes %s up to 4096 bytes and refuses one more, before asking Adena", async (_, unit, fits) => {
    expect(MAX_TEXT_BYTES).toBe(4096);
    const adena = new Wallet();
    expect(await signLogin(adena, login(unit.repeat(fits)))).toMatchObject({ ok: true });
    const over = unit === "a" ? "a".repeat(4097) : unit.repeat(fits + 1);
    expect(await signLogin(adena, login(over))).toEqual({ ok: false, reason: "too-long" });
    expect(adena.asked).toHaveLength(1);
  });

  it.each([
    ["an empty text", ""],
    ["a lone surrogate, which UTF-8 would change", "Sign in \ud800"],
  ])("refuses %s before asking Adena", async (_, text) => {
    const adena = new Wallet();
    expect(await signLogin(adena, login(text))).toEqual({ ok: false, reason: "malformed" });
    expect(adena.asked).toEqual([]);
  });

  it("says what is missing first: Adena, then SignArbitrary, then the text", async () => {
    expect(await signLogin(undefined, login("a".repeat(5000)))).toEqual({ ok: false, reason: "missing" });
    expect(await signLogin(new Wallet({ SignArbitrary: undefined }), login("a".repeat(5000)))).toEqual({
      ok: false,
      reason: "outdated",
    });
  });

  it.each([
    ["the person refuses to sign", { SignArbitrary: () => no("SIGN_REJECTED") }, "declined"],
    ["Adena is locked", { SignArbitrary: () => no("WALLET_LOCKED") }, "locked"],
    ["the person switched account in Adena", { SignArbitrary: () => no("ACCOUNT_MISMATCH") }, "mismatch"],
    ["Adena could not sign", { SignArbitrary: () => no("SIGN_FAILED") }, "failed"],
    ["Adena finds the request ill-formed", { SignArbitrary: () => no("INVALID_FORMAT") }, "failed"],
    ["the site is not let in", { SignArbitrary: () => no("NOT_CONNECTED") }, "failed"],
    ["the call rejects", { SignArbitrary: () => Promise.reject(new Error("closed")) }, "failed"],
    [
      "the call throws before any promise",
      {
        SignArbitrary: () => {
          throw new Error("sync");
        },
      },
      "failed",
    ],
    ["a proof of another shape", { SignArbitrary: () => ok("SIGN_ARBITRARY", { signed: {} }) }, "malformed"],
    ["an answer that is a string", { SignArbitrary: () => Promise.resolve("signed") }, "malformed"],
    [
      "a signature too long",
      {
        SignArbitrary: () =>
          ok("SIGN_ARBITRARY", {
            ...proofOf(TEXT),
            signature: { ...proofOf(TEXT).signature, signature: "A".repeat(129) },
          }),
      },
      "malformed",
    ],
    [
      "a memo too long",
      {
        SignArbitrary: () =>
          ok("SIGN_ARBITRARY", { ...proofOf(TEXT), signed: { ...proofOf(TEXT).signed, memo: "m".repeat(257) } }),
      },
      "malformed",
    ],
    ["a success whose type is another call's", { SignArbitrary: () => ok("SIGN_TX", proofOf(TEXT)) }, "malformed"],
  ])("says so when %s", async (_, over, reason) => {
    expect(await signLogin(new Wallet(over), login(TEXT))).toEqual({ ok: false, reason });
  });
});

describe("pageAdena", () => {
  it("reads the page's window.adena, as it is, whatever it holds", () => {
    const marker = { AddEstablish: () => undefined };
    vi.stubGlobal("adena", marker);
    expect(pageAdena()).toBe(marker);
    vi.unstubAllGlobals();
    expect(pageAdena()).toBeUndefined();
  });
});
