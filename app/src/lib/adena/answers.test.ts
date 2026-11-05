import { describe, expect, it } from "vitest";
import { Account, ask, Network, read, SITE } from "./answers.ts";

// Adena's answers as the SDK's table writes them (@adena-wallet/sdk 0.1.1, bin/index.js:785-990).
const answer = (status: string, type: string, rest: { code?: number; data?: unknown } = {}) => ({
  code: 0,
  message: "",
  data: {},
  status,
  type,
  ...rest,
});

describe("ask: one reader of Adena's answers, for the login and for a call", () => {
  it("takes ALREADY_CONNECTED as a success: the SDK's table calls it a failure and the SDK reads it as connected", async () => {
    const data = { connected: true };
    expect(
      await ask(
        () => answer("failure", "ALREADY_CONNECTED", { code: 4001, data }),
        ["CONNECTION_SUCCESS", "ALREADY_CONNECTED"],
      ),
    ).toEqual({ ok: true, data });
  });

  it("takes ALREADY_CONNECTED as a failure for a call that does not list it", async () => {
    expect(await ask(() => answer("failure", "ALREADY_CONNECTED", { code: 4001 }), ["GET_ACCOUNT"])).toMatchObject({
      ok: false,
      reason: "failed",
    });
  });

  it("is malformed for a success of another type than the call's", async () => {
    expect(await ask(() => answer("success", "GET_NETWORK"), ["GET_ACCOUNT"])).toMatchObject({
      ok: false,
      reason: "malformed",
    });
  });

  it("is malformed for the call's own success type that comes as a failure", async () => {
    expect(await ask(() => answer("failure", "GET_ACCOUNT"), ["GET_ACCOUNT"])).toMatchObject({
      ok: false,
      reason: "malformed",
    });
  });

  it("reads SIGN_REJECTED by its type, whatever its code: a refusal", async () => {
    expect(await ask(() => answer("failure", "SIGN_REJECTED"), ["SIGN_ARBITRARY"])).toMatchObject({
      ok: false,
      reason: "declined",
    });
  });

  it("is failed, not a throw, for a call that throws", async () => {
    expect(
      await ask(() => {
        throw new Error("gone");
      }, ["GET_ACCOUNT"]),
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
      ["GET_ACCOUNT"],
      Account,
    );
    expect(got).toEqual({ ok: true, value: { address: "not an address", chainId: "onyx-1" } });
  });
});
