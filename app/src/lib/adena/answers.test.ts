import { describe, expect, it } from "vitest";
import { Account, ask, Network, read, SUCCESSES } from "./answers.ts";

// Adena's answers as the SDK's table writes them (@adena-wallet/sdk 0.1.1, bin/index.js:785-990).
const answer = (status: string, type: string, rest: { code?: number; data?: unknown } = {}) => ({
  code: 0,
  message: "",
  data: {},
  status,
  type,
  ...rest,
});

// Each Adena method's success types, once, for every caller (F5663): the login and a call read this one table.
describe("SUCCESSES: what each Adena method answers when it succeeds", () => {
  const table: [string, string[]][] = [
    ["AddEstablish", ["CONNECTION_SUCCESS", "ALREADY_CONNECTED"]],
    ["GetAccount", ["GET_ACCOUNT"]],
    ["GetNetwork", ["GET_NETWORK"]],
    ["SwitchNetwork", ["SWITCH_NETWORK_SUCCESS"]],
    ["AddNetwork", ["ADD_NETWORK_SUCCESS"]],
    ["SignArbitrary", ["SIGN_ARBITRARY"]],
    ["DoContract", ["TRANSACTION_SUCCESS"]],
  ];

  it("names exactly these methods and these types: Adena answers GET_NETWORK (app/recording/adena-recording.json, entry 1), never GET_NETWORK_SUCCESS (D230)", () => {
    expect(Object.fromEntries(Object.entries(SUCCESSES))).toEqual(Object.fromEntries(table));
  });

  it.each(table.flatMap(([name, types]) => types.map((type) => [name, type] as const)))(
    "%s takes %s as its success",
    async (name, type) => {
      const status = type === "ALREADY_CONNECTED" ? "failure" : "success";
      expect(await ask(() => answer(status, type), name as keyof typeof SUCCESSES)).toMatchObject({ ok: true });
    },
  );

  it("refuses GET_NETWORK_SUCCESS: the recording shows Adena never sends it", async () => {
    expect(await ask(() => answer("success", "GET_NETWORK_SUCCESS"), "GetNetwork")).toStrictEqual({
      ok: false,
      reason: "malformed",
      type: "",
    });
  });
});

describe("ask: one reader of Adena's answers, for the login and for a call", () => {
  it("takes ALREADY_CONNECTED as a success: the SDK's table calls it a failure and the SDK reads it as connected", async () => {
    const data = { connected: true };
    expect(await ask(() => answer("failure", "ALREADY_CONNECTED", { code: 4001, data }), "AddEstablish")).toEqual({
      ok: true,
      data,
    });
  });

  // F5666 (decision of 2026-11-05, reverses that half of e0cae601): this test said "failed" for ALREADY_CONNECTED on GetAccount;
  // that type is another call's success, so it is malformed, as every success type of another method is.
  it("takes ALREADY_CONNECTED as malformed for a call that does not list it", async () => {
    expect(await ask(() => answer("failure", "ALREADY_CONNECTED", { code: 4001 }), "GetAccount")).toStrictEqual({
      ok: false,
      reason: "malformed",
      type: "",
    });
  });

  // F5666: a failure typed as another method's success is suspect, whatever its code says: malformed, no type, no log.
  const pairs = Object.entries(SUCCESSES).flatMap(([method, own]) =>
    Object.values(SUCCESSES)
      .flat()
      .filter((type) => !(own as readonly string[]).includes(type))
      .map((type) => [method, type] as const),
  );
  it.each(pairs)("is malformed for %s answered by a failure typed %s, another call's success", async (method, type) => {
    const failed = { ...answer("failure", type, { code: 4000 }), message: "rejected by the user" };
    expect(await ask(() => failed, method as keyof typeof SUCCESSES)).toStrictEqual({
      ok: false,
      reason: "malformed",
      type: "",
    });
  });

  it("is malformed for a success of another type than the call's", async () => {
    expect(await ask(() => answer("success", "GET_NETWORK"), "GetAccount")).toStrictEqual({
      ok: false,
      reason: "malformed",
      type: "",
    });
  });

  it("is malformed for the call's own success type that comes as a failure", async () => {
    expect(await ask(() => answer("failure", "GET_ACCOUNT"), "GetAccount")).toStrictEqual({
      ok: false,
      reason: "malformed",
      type: "",
    });
  });

  // A malformed answer has no type: a caller that branches on the type (switchTo) must not take it for a real one (F5664).
  it.each(["REDUNDANT_CHANGE_REQUEST", "UNADDED_NETWORK"])(
    "gives a success typed %s no type: it is malformed",
    async (type) => {
      expect(await ask(() => answer("success", type), "SwitchNetwork")).toStrictEqual({
        ok: false,
        reason: "malformed",
        type: "",
      });
    },
  );

  it("reads SIGN_REJECTED by its type, whatever its code: a refusal", async () => {
    expect(await ask(() => answer("failure", "SIGN_REJECTED"), "SignArbitrary")).toMatchObject({
      ok: false,
      reason: "declined",
    });
  });

  it("is failed, not a throw, for a call that throws", async () => {
    expect(
      await ask(() => {
        throw new Error("gone");
      }, "GetAccount"),
    ).toMatchObject({ ok: false, reason: "failed" });
  });
});

// Each row on its own: a type with a code that names nothing, then a code under a type nobody knows (bin/index.js:785-985).
describe("a failure's reason, by its type first and by its code for a type nobody knows", () => {
  it.each([
    ["NOT_CONNECTED", "not-connected"],
    ["UNRESOLVED_TRANSACTION_EXISTS", "busy"],
    ["WALLET_LOCKED", "locked"],
    ["ACCOUNT_MISMATCH", "wrong-account"],
    ["NO_ACCOUNT", "no-account"],
    ["TRANSACTION_REJECTED", "declined"],
    ["SIGN_REJECTED", "declined"],
    ["SWITCH_NETWORK_REJECTED", "declined"],
    ["ADD_NETWORK_REJECTED", "declined"],
    ["CONNECTION_REJECTED", "declined"],
    ["UNSUPPORTED_TYPE", "unsupported"],
  ])("reads %s as %s whatever its code", async (type, reason) => {
    expect(await ask(() => answer("failure", type, { code: 7777 }), "DoContract")).toStrictEqual({
      ok: false,
      reason,
      type,
    });
  });

  it.each(["TRANSACTION_FAILED", "INVALID_FORMAT", "UNEXPECTED_ERROR"])(
    "reads %s as failed with Adena's message, even under a code that names a refusal",
    async (type) => {
      const failed = { ...answer("failure", type, { code: 4000 }), message: "out of gas" };
      expect(await ask(() => failed, "DoContract")).toStrictEqual({
        ok: false,
        reason: "failed",
        type,
        log: "out of gas",
      });
    },
  );

  it.each([
    [1000, "not-connected"],
    [1001, "busy"],
    [2000, "locked"],
    [3001, "wrong-account"],
    [3002, "no-account"],
    [4000, "declined"],
    [4005, "unsupported"],
  ])("reads code %i under a type nobody knows as %s", async (code, reason) => {
    expect(await ask(() => answer("failure", "A_NEW_TYPE", { code }), "DoContract")).toStrictEqual({
      ok: false,
      reason,
      type: "A_NEW_TYPE",
    });
  });

  it("is failed with no log for a type and a code nobody knows, and for a failure with no message", async () => {
    const bare = { status: "failure", type: "A_NEW_TYPE", data: {} };
    expect(await ask(() => bare, "DoContract")).toStrictEqual({ ok: false, reason: "failed", type: "A_NEW_TYPE" });
  });
});

describe("the account and the network as both callers read them", () => {
  it.each(["", " ", "\t"])("takes no chain id of %j, in an account or a network", (chainId) => {
    expect(Network.safeParse({ chainId }).success).toBe(false);
    expect(Account.safeParse({ address: "g1x", chainId }).success).toBe(false);
  });

  it("reads an address as a string: why it is no address is the caller's to say", async () => {
    const got = await read(
      () => answer("success", "GET_ACCOUNT", { data: { address: "not an address", chainId: "onyx-1" } }),
      "GetAccount",
      Account,
    );
    expect(got).toEqual({ ok: true, value: { address: "not an address", chainId: "onyx-1" } });
  });
});
