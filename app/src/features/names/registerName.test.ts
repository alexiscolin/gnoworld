import type { ChainRead } from "@gnoworld/chain/read";
import { realmType } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import { describe, expect, it, vi } from "vitest";
import { recordedAdena, SIGNED_HASH } from "../../../tests/recordedAdena.ts";
import { callContract } from "../../lib/adena/call.ts";
import { createAppStore } from "../../store/index.ts";
import { callsIn, ensureCalls } from "../calls/slice.ts";
import type { SignDeps } from "../calls/signCall.ts";
import { REGISTER_ID, registerName, registrationOf } from "./registerName.ts";

// 9f: Register of r/sys/namereg/v0 through 9d's card course (signCall) on the universe's chain only: the name is checked before
// anything opens, the call's one argument is `nym-` and what was typed, and the person is registered only when the chain's
// answer says so. Adena is the recording's stand-in (app/tests/recordedAdena.ts), the chain's tx read a fake.
const ACCOUNT = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const ONYX = { chainId: "onyx-1", name: "Onyx", rpc: "https://rpc.onyx.testnets.gno.land:443" };
const MAINNET = { chainId: "gnoland-1", name: "gno.land", rpc: "https://rpc.gno.land:443" };
const source = { url: ONYX.rpc, at: "2026-11-06T05:00:00.000Z" };
const LANDED = { height: 55414, failed: false, data: "", log: "ok" };
const found = (value: typeof LANDED): ChainRead<typeof LANDED> => ({ ok: true, value, source });

function setup(over: Partial<SignDeps> = {}, adena = recordedAdena({ account: ACCOUNT })) {
  const store = ensureCalls(createAppStore());
  store.getState().loginActions.signedIn(ACCOUNT);
  const deps: SignDeps = {
    store,
    adena: adena.adena,
    universe: ONYX,
    call: callContract,
    read: vi.fn(() => Promise.resolve(found(LANDED))),
    wait: () => Promise.resolve(),
    watch: () => undefined,
    ...over,
  };
  const asked = () => adena.asked.map((entry) => entry.call);
  return { store, deps, adena, asked };
}
const stateOf = (store: ReturnType<typeof setup>["store"]) => callsIn(store.getState())?.calls[REGISTER_ID]?.state;

describe("registerName", () => {
  it("refuses a name outside the format with its rule, and opens no card and asks Adena nothing", async () => {
    const { store, deps, asked } = setup();
    const result = await registerName("alex", deps);
    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? "" : result.problem).toMatch(/5 to 13 letters, then 3 digits/);
    expect(callsIn(store.getState())?.calls[REGISTER_ID]).toBeUndefined();
    expect(asked()).toEqual([]);
  });

  it("refuses a reserved prefix the same way, before Adena opens", async () => {
    const { deps, asked } = setup();
    const result = await registerName("gnomes042", deps);
    expect(result.ok ? "" : result.problem).toMatch(/reserved prefix/);
    expect(asked()).toEqual([]);
  });

  it("signs Register(cur, username) of r/sys/namereg/v0 with `nym-` and the typed text, as the account, with nothing sent", async () => {
    const { deps, adena } = setup();
    expect(await registerName("alexis042", deps)).toEqual({ ok: true });
    const sent = adena.asked.find((entry) => entry.call === "DoContract")?.arg as {
      messages: { value: Record<string, unknown> }[];
    };
    expect(sent.messages[0]?.value).toMatchObject({
      caller: ACCOUNT,
      pkg_path: "gno.land/r/sys/namereg/v0",
      func: "Register",
      args: ["nym-alexis042"],
    });
    expect(sent.messages[0]?.value["send"]).toBeFalsy();
  });

  it("is registered only when the chain's answer is read: not while Adena signs, not while the hash lands", async () => {
    const gate = Promise.withResolvers<ChainRead<typeof LANDED>>();
    const read = vi.fn(() => gate.promise);
    const { store, deps } = setup({ read });
    const running = registerName("alexis042", deps);
    await vi.waitFor(() => {
      expect(read).toHaveBeenCalled();
    });
    expect(stateOf(store)).toMatchObject({ kind: "landing", hash: SIGNED_HASH });
    gate.resolve(found(LANDED));
    await running;
    expect(stateOf(store)).toEqual({ kind: "done", hash: SIGNED_HASH, height: 55414, value: "" });
  });

  it("is failed, not registered, when the chain says the call failed (the collision's error is shown as the chain's log)", async () => {
    const read = () => Promise.resolve(found({ ...LANDED, failed: true, log: "susers: canonical collision" }));
    const { store, deps } = setup({ read });
    await registerName("alexis042", deps);
    expect(stateOf(store)).toMatchObject({ kind: "failed", reason: "chain", log: "susers: canonical collision" });
  });

  it("asks for the universe's chain only: a mainnet universe's request names gnoland-1, and Onyx's never reaches it", async () => {
    const mainnet = setup({ universe: MAINNET }, recordedAdena({ account: ACCOUNT, chain: "gnoland-1" }));
    await registerName("alexis042", mainnet.deps);
    expect(callsIn(mainnet.store.getState())?.calls[REGISTER_ID]?.chainId).toBe("gnoland-1");
    const sent = mainnet.adena.asked.find((entry) => entry.call === "DoContract")?.arg as {
      messages: { value: Record<string, unknown> }[];
    };
    expect(JSON.stringify(sent)).toContain("gnoland-1");
    expect(JSON.stringify(sent)).not.toContain("onyx-1");
  });

  it("signs nothing when Adena is on another chain than the universe's and will not move", async () => {
    const adena = recordedAdena({ account: ACCOUNT, chain: "gnoland-1", stuck: true });
    const { store, deps, asked } = setup({}, adena);
    await registerName("alexis042", deps);
    expect(asked()).not.toContain("DoContract");
    expect(stateOf(store)).toMatchObject({ kind: "failed", reason: "wrong-network" });
  });

  it("offers no second Register after a maybe-sent with no hash: the card has no way back", async () => {
    const adena = recordedAdena({
      account: ACCOUNT,
      doContract: () => Promise.resolve({ status: "failure", type: "TRANSACTION_FAILED", message: "", data: {} }),
    });
    const { store, deps } = setup({}, adena);
    await registerName("alexis042", deps);
    expect(stateOf(store)).toEqual({ kind: "failed", reason: "maybe-sent" });
    callsIn(store.getState())?.callsActions.retry(REGISTER_ID);
    expect(stateOf(store)).toEqual({ kind: "failed", reason: "maybe-sent" });
    const again = await registerName("alexis043", deps);
    expect(again).toMatchObject({ ok: false });
    expect(adena.asked.filter((entry) => entry.call === "DoContract")).toHaveLength(1);
  });

  it("does not sign twice for two clicks in a row: the second finds the card already signing", async () => {
    const { deps, adena } = setup();
    await Promise.all([registerName("alexis042", deps), registerName("alexis042", deps)]);
    expect(adena.asked.filter((entry) => entry.call === "DoContract")).toHaveLength(1);
  });

  it("asks for a name when nobody is logged in, and signs nothing", async () => {
    const { store, deps, asked } = setup();
    store.getState().loginActions.signedOut();
    await registerName("alexis042", deps);
    expect(asked()).not.toContain("DoContract");
    expect(stateOf(store)).toMatchObject({ kind: "failed", reason: "logged-out" });
  });
});

// One card holds every registration of a page, so these run in one store: what an earlier one left is never taken for the next's.
describe("registerName: a store that already holds a registration", () => {
  const signedBy = (adena: ReturnType<typeof setup>["adena"]) =>
    adena.asked.filter((entry) => entry.call === "DoContract");
  const failing = (type: string) => () => Promise.resolve({ status: "failure", type, message: "", data: {} });

  it("signs a second time after a decline: the card goes back to its preview, and ends done", async () => {
    const adena = recordedAdena({ account: ACCOUNT, doContract: failing("TRANSACTION_REJECTED") });
    const { store, deps } = setup({}, adena);
    expect(await registerName("alexis042", deps)).toEqual({ ok: true });
    expect(stateOf(store)).toMatchObject({ kind: "failed", reason: "declined" });
    const second = recordedAdena({ account: ACCOUNT });
    expect(await registerName("alexis043", { ...deps, adena: second.adena })).toEqual({ ok: true });
    expect(stateOf(store)).toMatchObject({ kind: "done", height: 55414 });
    expect(JSON.stringify(signedBy(second))).toContain("nym-alexis043");
  });

  it("asks for the other universe's chain after a decline on this one, never a silent end on the first's card", async () => {
    const adena = recordedAdena({ account: ACCOUNT, doContract: failing("TRANSACTION_REJECTED") });
    const { store, deps } = setup({}, adena);
    await registerName("alexis042", deps);
    const mainnet = recordedAdena({ account: ACCOUNT, chain: "gnoland-1" });
    expect(await registerName("alexis042", { ...deps, adena: mainnet.adena, universe: MAINNET })).toEqual({ ok: true });
    expect(callsIn(store.getState())?.calls[REGISTER_ID]?.chainId).toBe("gnoland-1");
    expect(JSON.stringify(signedBy(mainnet))).toContain("gnoland-1");
    expect(stateOf(store)).toMatchObject({ kind: "done" });
  });

  it("refuses a second Register for a hash the chain did not show, and for a call that may have been sent, and says why", async () => {
    const unseen = () =>
      Promise.resolve<ChainRead<typeof LANDED>>({
        ok: false,
        failure: { kind: "not-landed", next: "not yet" },
        source,
      });
    const { store, deps, adena } = setup({ read: unseen });
    expect(await registerName("alexis042", deps)).toEqual({ ok: true });
    expect(stateOf(store)).toMatchObject({ kind: "failed", reason: "unseen", hash: SIGNED_HASH });
    const again = await registerName("alexis043", deps);
    expect(again.ok ? "" : again.problem).toMatch(/may already have been sent/);
    expect(signedBy(adena)).toHaveLength(1);
  });

  it("refuses a second Register while one is under way, and one for an account that has just registered", async () => {
    const gate = Promise.withResolvers<ChainRead<typeof LANDED>>();
    const { deps, adena } = setup({ read: () => gate.promise });
    const first = registerName("alexis042", deps);
    await vi.waitFor(() => {
      expect(signedBy(adena)).toHaveLength(1);
    });
    const busy = await registerName("alexis043", deps);
    expect(busy.ok ? "" : busy.problem).toMatch(/already under way/);
    gate.resolve(found(LANDED));
    await first;
    const registered = await registerName("alexis043", deps);
    expect(registered.ok ? "" : registered.problem).toMatch(/just registered/);
    expect(signedBy(adena)).toHaveLength(1);
  });

  it("tries again after the chain ran the call and the realm refused it: nothing changed, the hash is no reason to refuse", async () => {
    const reads = [{ ...LANDED, failed: true, log: "susers: canonical collision" }, LANDED];
    const { store, deps, adena } = setup({ read: () => Promise.resolve(found(reads.shift() ?? LANDED)) });
    await registerName("alexis042", deps);
    expect(stateOf(store)).toMatchObject({ kind: "failed", reason: "chain" });
    expect(await registerName("alexis043", deps)).toEqual({ ok: true });
    expect(stateOf(store)).toMatchObject({ kind: "done" });
    expect(signedBy(adena)).toHaveLength(2);
  });

  it("shows a paused registry's refusal as the chain's own log: no read of IsPaused is made before Adena opens", async () => {
    const hashes: string[] = [];
    const read = (hash: string) => {
      hashes.push(hash);
      return Promise.resolve(found({ ...LANDED, failed: true, log: "namereg: paused" }));
    };
    const { store, deps } = setup({ read });
    await registerName("alexis042", deps);
    expect(stateOf(store)).toMatchObject({ kind: "failed", reason: "chain", log: "namereg: paused" });
    // The only read a registration can make is of its own transaction, by hash; there is no read to ask IsPaused with.
    expect(hashes.length).toBeGreaterThan(0);
    expect(hashes.every((hash) => hash === SIGNED_HASH)).toBe(true);
  });

  it("starts the next account's registration afresh: a card done for the first is closed, whatever it said", async () => {
    const { store, deps } = setup();
    await registerName("alexis042", deps);
    expect(stateOf(store)).toMatchObject({ kind: "done" });
    const other = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
    store.getState().loginActions.signedIn(other);
    const second = recordedAdena({ account: other });
    expect(registrationOf(store.getState(), ACCOUNT, "onyx-1")?.state).toMatchObject({ kind: "done" });
    expect(registrationOf(store.getState(), other, "onyx-1")).toBeUndefined();
    expect(await registerName("bobname043", { ...deps, adena: second.adena })).toEqual({ ok: true });
    expect(registrationOf(store.getState(), other, "onyx-1")?.texts).toEqual(["nym-bobname043"]);
    expect(registrationOf(store.getState(), ACCOUNT, "onyx-1")).toBeUndefined();
  });
});

describe("registerName: while Adena is asked, and whose card it is", () => {
  it("refuses a second Register while Adena still holds the signature, and asks it once", async () => {
    const gate = Promise.withResolvers<unknown>();
    const adena = recordedAdena({ account: ACCOUNT, doContract: () => gate.promise });
    const { store, deps } = setup({}, adena);
    const first = registerName("alexis042", deps);
    await vi.waitFor(() => {
      expect(adena.asked.some((entry) => entry.call === "DoContract")).toBe(true);
    });
    expect(stateOf(store)).toEqual({ kind: "signing" });
    const second = await registerName("alexis043", deps);
    expect(second.ok ? "" : second.problem).toMatch(/already under way/);
    expect(adena.asked.filter((entry) => entry.call === "DoContract")).toHaveLength(1);
    gate.resolve({ status: "failure", type: "TRANSACTION_REJECTED", message: "", data: {} });
    await first;
  });

  it("opens the card with Register's two parameters, the realm first and the name second", async () => {
    const { store, deps } = setup();
    await registerName("alexis042", deps);
    expect(callsIn(store.getState())?.calls[REGISTER_ID]?.params).toEqual([
      { Name: "cur", Type: realmType() },
      { Name: "username", Type: "string" },
    ]);
  });

  it("gives no card where the store holds no calls yet, and none for a card another chain took the place of", async () => {
    expect(registrationOf(createAppStore().getState(), ACCOUNT, "onyx-1")).toBeUndefined();
    const { store, deps } = setup();
    await registerName("alexis042", deps);
    const actions = callsIn(store.getState())?.callsActions;
    actions?.close(REGISTER_ID);
    actions?.open({ id: REGISTER_ID, chainId: "gnoland-1", realm: "r", func: "Register", params: [] });
    expect(registrationOf(store.getState(), ACCOUNT, "onyx-1")).toBeUndefined();
    expect(registrationOf(store.getState(), ACCOUNT, "gnoland-1")).toBeUndefined();
  });

  it("keeps a card opened with nobody logged in to no account", async () => {
    const { store, deps } = setup();
    store.getState().loginActions.signedOut();
    await registerName("alexis042", deps);
    expect(registrationOf(store.getState(), "", "onyx-1")?.state).toMatchObject({ reason: "logged-out" });
    expect(registrationOf(store.getState(), ACCOUNT, "onyx-1")).toBeUndefined();
  });
});
