import { realmType } from "@gnoworld/core";
import type { ChainRead } from "@gnoworld/chain/read";
import { Address } from "@gnoworld/schemas";
import { describe, expect, it, vi } from "vitest";
import { callContract } from "../../lib/adena/call.ts";
import { createAppStore } from "../../store/index.ts";
import { recordedAdena, SIGNED_HASH } from "../../../tests/recordedAdena.ts";
import { signCall, type SignDeps } from "./signCall.ts";
import { ensureCalls, type CallsStore } from "./slice.ts";

// 9d: the card's course, through the real callContract and a stand-in for Adena built from the recording
// (app/tests/recordedAdena.ts): preview, "Sign in Adena", landing in a block, the result. Done only from the chain's answer.
const CALLER = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const ONYX = { chainId: "onyx-1", name: "Onyx", rpc: "https://rpc.onyx.testnets.gno.land:443" };
const PARAMS = [
  { Name: "cur", Type: realmType() },
  { Name: "bio", Type: "string" },
];
const NEW = { id: "SetBio", chainId: "onyx-1", realm: "gno.land/r/demo/profile", func: "SetBio", params: PARAMS };
const source = { url: ONYX.rpc, at: "2026-11-05T05:00:00.000Z" };
const LANDED = { height: 55414, failed: false, data: "(42 int)", log: "ok" };
const found = (value: typeof LANDED): ChainRead<typeof LANDED> => ({ ok: true, value, source });
const missing: ChainRead<typeof LANDED> = {
  ok: false,
  failure: { kind: "not-landed", next: "The chain has not seen it yet." },
  source,
};

interface Setup {
  text?: string;
  session?: "in" | "out";
  adena?: unknown;
  read?: SignDeps["read"];
  call?: SignDeps["call"];
}
function setup({ text = "hello", session = "in", adena, read, call }: Setup = {}) {
  const store = ensureCalls(createAppStore());
  if (session === "in") store.getState().loginActions.signedIn(CALLER);
  else store.getState().loginActions.signedOut();
  store.getState().callsActions.open(NEW);
  store.getState().callsActions.edit("SetBio", 0, text);
  const log: string[] = [];
  const waits: number[] = [];
  const wallet = recordedAdena({ account: CALLER });
  const deps: SignDeps = {
    store,
    adena: adena ?? wallet.adena,
    universe: ONYX,
    call: call ?? callContract,
    read: read ?? vi.fn(() => Promise.resolve(found(LANDED))),
    wait: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
    watch: () => {
      log.push("watch");
    },
  };
  return { store, deps, wallet, log, waits };
}
const stateOf = (store: CallsStore) => store.getState().calls["SetBio"]?.state;

describe("signCall: the card's course", () => {
  it("signs through Adena as the logged-in account on the universe's chain, follows the hash to its block, and is done with the chain's height and value", async () => {
    const read = vi.fn(() => Promise.resolve(found(LANDED)));
    const { store, deps, wallet } = setup({ read });
    await signCall("SetBio", deps);
    expect(stateOf(store)).toEqual({ kind: "done", hash: SIGNED_HASH, height: 55414, value: "(42 int)" });
    expect(read).toHaveBeenCalledWith(SIGNED_HASH);
    const sent = wallet.asked.find((a) => a.call === "DoContract")?.arg as {
      messages: { value: Record<string, unknown> }[];
    };
    expect(sent.messages[0]?.value).toMatchObject({
      caller: CALLER,
      pkg_path: NEW.realm,
      func: "SetBio",
      args: ["hello"],
    });
  });

  it("rises, as a bug and not a state, when it is asked in a store that has no calls' slice (F5726)", async () => {
    const { deps } = setup();
    await expect(signCall("SetBio", { ...deps, store: createAppStore() })).rejects.toThrow(/no calls' slice/);
  });

  it("is landing, not done, while the chain has not answered: Adena's word alone never ends it", async () => {
    const pending = Promise.withResolvers<ChainRead<typeof LANDED>>();
    const read = vi.fn(() => pending.promise);
    const { store, deps } = setup({ read });
    const running = signCall("SetBio", deps);
    await vi.waitFor(() => {
      expect(read).toHaveBeenCalled();
    });
    expect(stateOf(store)).toEqual({ kind: "landing", hash: SIGNED_HASH });
    pending.resolve(found(LANDED));
    await running;
    expect(stateOf(store)?.kind).toBe("done");
  });

  it("is signing while Adena's popup is open, and asks the chain nothing before the hash", async () => {
    const gate = Promise.withResolvers<unknown>();
    const wallet = recordedAdena({ account: CALLER, doContract: () => gate.promise });
    const read = vi.fn(() => Promise.resolve(found(LANDED)));
    const { store, deps } = setup({ adena: wallet.adena, read });
    const running = signCall("SetBio", deps);
    await vi.waitFor(() => {
      expect(wallet.asked.some((a) => a.call === "DoContract")).toBe(true);
    });
    expect(stateOf(store)).toEqual({ kind: "signing" });
    expect(read).not.toHaveBeenCalled();
    gate.resolve({ status: "failure", type: "TRANSACTION_REJECTED", code: 4000, message: "", data: {} });
    await running;
    expect(stateOf(store)).toEqual({ kind: "failed", reason: "declined-maybe-sent" });
    expect(read).not.toHaveBeenCalled();
  });

  it("is failed with the realm's own log when the chain says the call failed, at a height, and the hash kept", async () => {
    const read = vi.fn(() => Promise.resolve(found({ ...LANDED, failed: true, data: "", log: "panic: name taken" })));
    const { store, deps } = setup({ read });
    await signCall("SetBio", deps);
    expect(stateOf(store)).toEqual({ kind: "failed", reason: "chain", log: "panic: name taken", hash: SIGNED_HASH });
  });

  it("follows the hash by the chain when Adena says signed with an error set: it is the chain that says what became of the call (F5728)", async () => {
    const wallet = recordedAdena({
      account: CALLER,
      doContract: () =>
        Promise.resolve({
          status: "success",
          type: "TRANSACTION_SUCCESS",
          code: 0,
          message: "",
          data: { error: { message: "out of gas" }, data: null, Log: "out of gas", hash: SIGNED_HASH },
        }),
    });
    const read = vi.fn(() => Promise.resolve(found({ ...LANDED, failed: true, data: "", log: "out of gas" })));
    const { store, deps } = setup({ adena: wallet.adena, read });
    await signCall("SetBio", deps);
    expect(read).toHaveBeenCalledWith(SIGNED_HASH);
    expect(stateOf(store)).toEqual({ kind: "failed", reason: "chain", log: "out of gas", hash: SIGNED_HASH });
  });

  it("is failed maybe-sent, with no way back and no read, when DoContract failed after the popup with no hash (F5728)", async () => {
    const wallet = recordedAdena({
      account: CALLER,
      doContract: () => Promise.resolve({ status: "failure", type: "TRANSACTION_FAILED", message: "", data: {} }),
    });
    const read = vi.fn(() => Promise.resolve(found(LANDED)));
    const { store, deps } = setup({ adena: wallet.adena, read });
    await signCall("SetBio", deps);
    expect(stateOf(store)).toEqual({ kind: "failed", reason: "maybe-sent" });
    expect(read).not.toHaveBeenCalled();
    store.getState().callsActions.retry("SetBio");
    expect(stateOf(store)?.kind).toBe("failed");
  });

  it("follows the hash of a refusal that names one, never offering Try again: it was signed (F5750)", async () => {
    const wallet = recordedAdena({
      account: CALLER,
      doContract: () =>
        Promise.resolve({
          status: "failure",
          type: "WALLET_LOCKED",
          code: 2000,
          message: "",
          data: { hash: SIGNED_HASH },
        }),
    });
    const read = vi.fn(() => Promise.resolve(found(LANDED)));
    const { store, deps } = setup({ adena: wallet.adena, read });
    await signCall("SetBio", deps);
    expect(read).toHaveBeenCalled();
    expect(stateOf(store)).toMatchObject({ kind: "done", hash: SIGNED_HASH });
  });

  describe("a call Adena says failed after it named the hash (F5749)", () => {
    const refused = () => {
      const wallet = recordedAdena({
        account: CALLER,
        doContract: () =>
          Promise.resolve({
            status: "failure",
            type: "TRANSACTION_FAILED",
            message: "Transaction failed",
            data: { hash: SIGNED_HASH, error: "TM2Error{...}", log: "insufficient funds" },
          }),
      });
      return wallet.adena;
    };

    it("is landing with Adena's log while the chain is asked", async () => {
      const pending = Promise.withResolvers<ChainRead<typeof LANDED>>();
      const read = vi.fn(() => pending.promise);
      const { store, deps } = setup({ adena: refused(), read });
      const running = signCall("SetBio", deps);
      await vi.waitFor(() => {
        expect(read).toHaveBeenCalled();
      });
      expect(stateOf(store)).toEqual({ kind: "landing", hash: SIGNED_HASH, adena: "insufficient funds" });
      pending.resolve(found(LANDED));
      await running;
    });

    it("ends unseen with Adena's log kept, so the card can say what Adena said", async () => {
      const { store, deps } = setup({ adena: refused(), read: vi.fn(() => Promise.resolve(missing)) });
      await signCall("SetBio", deps);
      expect(stateOf(store)).toEqual({
        kind: "failed",
        reason: "unseen",
        hash: SIGNED_HASH,
        adena: "insufficient funds",
      });
    });
  });

  it("follows a call that is not in a block yet, waiting between reads, until it lands", async () => {
    const read = vi
      .fn<SignDeps["read"]>()
      .mockResolvedValueOnce(missing)
      .mockResolvedValueOnce(missing)
      .mockResolvedValue(found(LANDED));
    const { store, deps, waits } = setup({ read });
    await signCall("SetBio", deps);
    expect(read).toHaveBeenCalledTimes(3);
    expect(waits).toHaveLength(2);
    expect(waits.every((ms) => ms > 0)).toBe(true);
    expect(stateOf(store)?.kind).toBe("done");
  });

  it("gives up on a call that never lands, after a bound it says: failed 'unseen' with the hash, never done, never an endless wait", async () => {
    const read = vi.fn(() => Promise.resolve(missing));
    const { store, deps, waits } = setup({ read });
    await signCall("SetBio", deps);
    expect(stateOf(store)).toEqual({ kind: "failed", reason: "unseen", hash: SIGNED_HASH });
    expect(read.mock.calls.length).toBeGreaterThan(2);
    expect(read.mock.calls.length).toBeLessThanOrEqual(100);
    const total = waits.reduce((sum, ms) => sum + ms, 0);
    expect(total).toBeGreaterThanOrEqual(15_000);
    expect(total).toBeLessThanOrEqual(180_000);
  });

  it("carries no cause for a call that waited out the bound: the wait itself is the cause (F5725)", async () => {
    const read = vi.fn(() => Promise.resolve(missing));
    const { store, deps } = setup({ read });
    await signCall("SetBio", deps);
    expect(stateOf(store)).not.toHaveProperty("log");
  });

  it("treats a node that is down or slow as not landed yet, within the same bound, and ends unseen", async () => {
    const down: ChainRead<typeof LANDED> = { ok: false, failure: { kind: "down", next: "Try again." }, source };
    const read = vi.fn(() => Promise.resolve(down));
    const { store, deps } = setup({ read });
    await signCall("SetBio", deps);
    expect(stateOf(store)).toEqual({ kind: "failed", reason: "unseen", hash: SIGNED_HASH });
  });

  it("says a read that answers another chain's node is unseen with the hash, at once, and never done from it", async () => {
    const other: ChainRead<typeof LANDED> = {
      ok: false,
      failure: { kind: "other-chain", next: "Wrong node." },
      source,
    };
    const read = vi.fn(() => Promise.resolve(other));
    const { store, deps } = setup({ read });
    await signCall("SetBio", deps);
    expect(stateOf(store)).toEqual({ kind: "failed", reason: "unseen", hash: SIGNED_HASH, log: "Wrong node." });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it.each(["wrong-shape", "refused", "bad-name", "too-big", "not-json"] as const)(
    "does not read again a node's answer that cannot change (%s): unseen at once, with the hash",
    async (kind) => {
      const read = vi.fn(() => Promise.resolve({ ok: false, failure: { kind, next: "No." }, source } as const));
      const { store, deps, waits } = setup({ read });
      await signCall("SetBio", deps);
      expect(stateOf(store)).toEqual({ kind: "failed", reason: "unseen", hash: SIGNED_HASH, log: "No." });
      expect(read).toHaveBeenCalledTimes(1);
      expect(waits).toEqual([]);
    },
  );

  it.each(["not-landed", "down", "timeout", "chain-refused"] as const)(
    "reads again after %s, which a moment can change, until the bound",
    async (kind) => {
      const read = vi
        .fn<SignDeps["read"]>()
        .mockResolvedValueOnce({ ok: false, failure: { kind, next: "Wait." }, source })
        .mockResolvedValue(found(LANDED));
      const { store, deps } = setup({ read });
      await signCall("SetBio", deps);
      expect(read).toHaveBeenCalledTimes(2);
      expect(stateOf(store)?.kind).toBe("done");
    },
  );

  it("counts the time the reads take in its bound, so a node that answers slowly does not hold the card for minutes", async () => {
    let clock = 0;
    const read = vi.fn(() => {
      clock += 8000;
      return Promise.resolve(missing);
    });
    const { store, deps } = setup({ read });
    await signCall("SetBio", { ...deps, now: () => clock });
    expect(stateOf(store)).toEqual({ kind: "failed", reason: "unseen", hash: SIGNED_HASH });
    expect(read.mock.calls.length).toBeLessThanOrEqual(16);
    expect(read.mock.calls.length).toBeGreaterThan(8);
  });
});

describe("signCall: what stops it before Adena signs", () => {
  it("asks nobody for a call with a problem in a field: the card stays in preview", async () => {
    const calls = vi.fn(callContract);
    const bool = [PARAMS[0] ?? { Name: "", Type: "" }, { Name: "loud", Type: "bool" }];
    const { store, deps } = setup({ text: "maybe", call: calls });
    store.getState().callsActions.close("SetBio");
    store.getState().callsActions.open({ ...NEW, params: bool });
    store.getState().callsActions.edit("SetBio", 0, "maybe");
    await signCall("SetBio", deps);
    expect(calls).not.toHaveBeenCalled();
    expect(stateOf(store)).toEqual({ kind: "preview" });
  });

  it("stops a logged-out person before Adena is asked: failed 'logged-out'", async () => {
    const { store, deps, wallet } = setup({ session: "out" });
    await signCall("SetBio", deps);
    expect(stateOf(store)).toEqual({ kind: "failed", reason: "logged-out" });
    expect(wallet.asked).toEqual([]);
  });

  it("stops a call on the wrong network before signing: Adena on another chain that will not move is failed 'wrong-network', and DoContract is never asked", async () => {
    const wallet = recordedAdena({ account: CALLER, chain: "gnoland-1", stuck: true });
    const { store, deps } = setup({ adena: wallet.adena });
    await signCall("SetBio", deps);
    expect(stateOf(store)).toEqual({ kind: "failed", reason: "wrong-network" });
    expect(wallet.asked.map((a) => a.call)).not.toContain("DoContract");
  });

  it("moves Adena to the universe's chain first when it is on another and lets it, then signs", async () => {
    const wallet = recordedAdena({ account: CALLER, chain: "gnoland-1" });
    const { store, deps } = setup({ adena: wallet.adena });
    await signCall("SetBio", deps);
    const names = wallet.asked.map((a) => a.call);
    expect(names.indexOf("SwitchNetwork")).toBeLessThan(names.indexOf("DoContract"));
    expect(stateOf(store)?.kind).toBe("done");
  });

  it("stops a call for an account that is not the logged-in one: failed 'wrong-account', DoContract never asked", async () => {
    const wallet = recordedAdena({ account: "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv" });
    const { store, deps } = setup({ adena: wallet.adena });
    await signCall("SetBio", deps);
    expect(stateOf(store)).toEqual({ kind: "failed", reason: "wrong-account" });
    expect(wallet.asked.map((a) => a.call)).not.toContain("DoContract");
  });

  it("does not sign a card opened for another chain than the universe's: it stays in preview and Adena is asked nothing (F5722)", async () => {
    const { store, deps, wallet } = setup();
    store.getState().callsActions.close("SetBio");
    store.getState().callsActions.open({ ...NEW, chainId: "gnoland-1" });
    store.getState().callsActions.edit("SetBio", 0, "hello");
    await signCall("SetBio", deps);
    expect(stateOf(store)).toEqual({ kind: "preview" });
    expect(wallet.asked).toEqual([]);
  });

  it("is failed 'missing' with no wallet in the page, and nothing is thrown", async () => {
    const { store, deps } = setup({ adena: undefined });
    await signCall("SetBio", { ...deps, adena: undefined });
    expect(stateOf(store)).toEqual({ kind: "failed", reason: "missing" });
  });

  it("ignores a card that is not there, one already being signed, and one done: a double click signs once", async () => {
    const calls = vi.fn(callContract);
    const { store, deps } = setup({ call: calls });
    await signCall("Nothing", deps);
    expect(calls).not.toHaveBeenCalled();
    await Promise.all([signCall("SetBio", deps), signCall("SetBio", deps)]);
    expect(calls).toHaveBeenCalledTimes(1);
    await signCall("SetBio", deps);
    expect(calls).toHaveBeenCalledTimes(1);
    expect(stateOf(store)?.kind).toBe("done");
  });
});

describe("signCall: a second request waits for the first", () => {
  it("asks Adena for the second card's call only once the first is answered, and the second shows 'signing' meanwhile", async () => {
    const gate = Promise.withResolvers<unknown>();
    let signed = 0;
    const wallet = recordedAdena({
      account: CALLER,
      doContract: () => {
        signed += 1;
        return signed === 1
          ? gate.promise
          : Promise.resolve({ status: "failure", type: "TRANSACTION_REJECTED", code: 4000, message: "", data: {} });
      },
    });
    const { store, deps } = setup({ adena: wallet.adena });
    store.getState().callsActions.open({ ...NEW, id: "SetName", func: "SetName" });
    store.getState().callsActions.edit("SetName", 0, "alexis");
    const first = signCall("SetBio", deps);
    await vi.waitFor(() => {
      expect(signed).toBe(1);
    });
    const second = signCall("SetName", deps);
    await vi.waitFor(() => {
      expect(store.getState().calls["SetName"]?.state).toEqual({ kind: "signing" });
    });
    expect(signed).toBe(1);
    gate.resolve({
      status: "success",
      type: "TRANSACTION_SUCCESS",
      code: 0,
      message: "",
      data: { error: null, data: null, Log: "", hash: SIGNED_HASH },
    });
    await Promise.all([first, second]);
    expect(signed).toBe(2);
    expect(stateOf(store)?.kind).toBe("done");
    expect(store.getState().calls["SetName"]?.state).toEqual({ kind: "failed", reason: "declined-maybe-sent" });
  });
});

describe("signCall: the account watch (F5651)", () => {
  it("starts the watch of Adena's account on the card's first gesture, with the page's Adena, before Adena is asked to sign", async () => {
    const order: string[] = [];
    const wallet = recordedAdena({
      account: CALLER,
      doContract: () => {
        order.push("sign");
        return Promise.resolve({
          status: "success",
          type: "TRANSACTION_SUCCESS",
          code: 0,
          message: "",
          data: { error: null, data: null, Log: "", hash: SIGNED_HASH },
        });
      },
    });
    const { deps } = setup({ adena: wallet.adena });
    const watch = vi.fn((adena: unknown) => {
      order.push("watch");
      expect(adena).toBe(wallet.adena);
    });
    await signCall("SetBio", { ...deps, watch });
    expect(order.slice(0, 2)).toEqual(["watch", "sign"]);
  });

  it("starts no watch for a click that stops at a logged-out session: nothing of Adena is loaded for it", async () => {
    const out = setup({ session: "out" });
    const watch = vi.fn();
    await signCall("SetBio", { ...out.deps, watch });
    expect(watch).not.toHaveBeenCalled();
  });

  it("starts no watch for a click that stops at a field's problem", async () => {
    const { store, deps } = setup();
    store.getState().callsActions.close("SetBio");
    store
      .getState()
      .callsActions.open({ ...NEW, params: [PARAMS[0] ?? { Name: "", Type: "" }, { Name: "n", Type: "int64" }] });
    store.getState().callsActions.edit("SetBio", 0, "three");
    const watch = vi.fn();
    await signCall("SetBio", { ...deps, watch });
    expect(watch).not.toHaveBeenCalled();
    expect(stateOf(store)).toEqual({ kind: "preview" });
  });

  it("fails the card, with its next step, when the watch cannot be started: nothing is signed", async () => {
    const calls = vi.fn(callContract);
    const { store, deps } = setup({ call: calls });
    await signCall("SetBio", { ...deps, watch: () => Promise.reject(new Error("chunk")) });
    expect(stateOf(store)).toEqual({ kind: "failed", reason: "failed" });
    expect(calls).not.toHaveBeenCalled();
  });
});
