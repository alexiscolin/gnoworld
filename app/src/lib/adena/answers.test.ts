import { describe, expect, it } from "vitest";
import { Account, ask, Network, read, SITE, SUCCESSES } from "./answers.ts";

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
    expect(await ask(() => answer("success", "GET_NETWORK_SUCCESS"), "GetNetwork")).toMatchObject({
      ok: false,
      reason: "malformed",
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

  it("takes ALREADY_CONNECTED as a failure for a call that does not list it", async () => {
    expect(await ask(() => answer("failure", "ALREADY_CONNECTED", { code: 4001 }), "GetAccount")).toMatchObject({
      ok: false,
      reason: "failed",
    });
  });

  it("is malformed for a success of another type than the call's", async () => {
    expect(await ask(() => answer("success", "GET_NETWORK"), "GetAccount")).toMatchObject({
      ok: false,
      reason: "malformed",
    });
  });

  it("is malformed for the call's own success type that comes as a failure", async () => {
    expect(await ask(() => answer("failure", "GET_ACCOUNT"), "GetAccount")).toMatchObject({
      ok: false,
      reason: "malformed",
    });
  });

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

describe("the account and the network as both callers read them", () => {
  it("names the site gnoworld", () => {
    expect(SITE).toBe("gnoworld");
  });

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
