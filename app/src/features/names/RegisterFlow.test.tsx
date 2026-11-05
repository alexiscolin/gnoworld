// @vitest-environment jsdom
import type { CallFees } from "@gnoworld/chain/fees";
import type { ChainRead } from "@gnoworld/chain/read";
import { Address } from "@gnoworld/schemas";
import { act, useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "../../../tests/mount.tsx";
import { recordedAdena } from "../../../tests/recordedAdena.ts";
import { callContract } from "../../lib/adena/call.ts";
import { StoreProvider, useAppStore } from "../../storeContext.tsx";
import { feeText, type Parts } from "../calls/index.ts";
import type { NameDialogProps } from "./NameDialog.tsx";
import { NAMEREG, nymProblem } from "./nym.ts";
import { RegisterFlow, type RegisterFlowProps } from "./RegisterFlow.tsx";

// 9f: what the flow passes the dialog (the fee, the card's course, a refusal before any card) and when it asks the chain for the fee.
// The dialog has its own tests; here it is a stand-in that keeps the props it was drawn with.
const hoisted = vi.hoisted(() => ({
  drawn: [] as unknown[],
  load: (): Promise<unknown> => Promise.resolve(undefined),
}));
vi.mock("./NameDialog.tsx", () => ({
  NameDialog: (props: unknown) => {
    hoisted.drawn.push(props);
    return null;
  },
}));
vi.mock("../calls/index.ts", async (original) => ({
  ...(await original<typeof import("../calls/index.ts")>()),
  pageParts: () => hoisted.load(),
}));

const ACCOUNT = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const UNIVERSE = {
  chainId: "onyx-1",
  rpc: "https://rpc.onyx",
  name: "Onyx",
  real: false,
  indexer: "https://indexer.onyx",
};
const source = { url: "https://indexer.onyx", at: "2026-11-06T05:00:00.000Z" };
const FEES: CallFees = { fees: [48_000, 1_000_000], height: 56_773 };
const feesRead = (): Promise<ChainRead<CallFees>> => Promise.resolve({ ok: true, value: FEES, source });
const LANDED = { height: 55_414, failed: false, data: "", log: "ok" };

const props = () => hoisted.drawn.at(-1) as NameDialogProps;
const settled = () => act(() => Promise.resolve());

function Signed() {
  useAppStore().getState().loginActions.signedIn(ACCOUNT);
  return null;
}

const partsOf = (wallet: ReturnType<typeof recordedAdena>): Parts => ({
  adena: wallet.adena,
  call: callContract,
  read: () => Promise.resolve({ ok: true, value: LANDED, source }),
  wait: () => Promise.resolve(),
  watch: () => undefined,
});

// The flow as a page holds it: its props change under it.
function flow(over: Partial<RegisterFlowProps> = {}) {
  const wallet = recordedAdena({ account: ACCOUNT });
  const parts = partsOf(wallet);
  const onSettled = vi.fn();
  const handle: { change: (next: Partial<RegisterFlowProps>) => void } = { change: () => undefined };
  const Host = () => {
    const [shown, setShown] = useState<Partial<RegisterFlowProps>>({});
    useEffect(() => {
      handle.change = (next) => {
        setShown((before) => ({ ...before, ...next }));
      };
    }, []);
    return (
      <RegisterFlow
        account={ACCOUNT}
        universe={UNIVERSE}
        open
        onClose={() => undefined}
        onSettled={onSettled}
        deps={parts}
        fees={feesRead}
        {...over}
        {...shown}
      />
    );
  };
  mount(
    <StoreProvider>
      <Signed />
      <Host />
    </StoreProvider>,
  );
  return {
    onSettled,
    wallet,
    change: (next: Partial<RegisterFlowProps>) => {
      act(() => {
        handle.change(next);
      });
    },
  };
}

afterEach(() => {
  hoisted.drawn.length = 0;
  hoisted.load = () => Promise.resolve(undefined);
  vi.unstubAllGlobals();
});

describe("RegisterFlow: the fee", () => {
  it("asks the universe's indexer for Register's fees once, and words what it read as the call card does", async () => {
    const fees = vi.fn(feesRead);
    flow({ fees });
    await settled();
    expect(fees).toHaveBeenCalledExactlyOnceWith(UNIVERSE.indexer, { realm: NAMEREG, func: "Register" });
    expect(props().fee).toBe(feeText(FEES));
  });

  it("words no estimate when the read gave none", async () => {
    flow({ fees: () => Promise.resolve({ ok: false, failure: { kind: "down", next: "Try again." }, source }) });
    await settled();
    expect(props().fee).toBe(feeText(undefined));
  });

  it("reads again for another universe's indexer, and not for a render that changes nothing", async () => {
    const fees = vi.fn(feesRead);
    const { change } = flow({ fees });
    await settled();
    change({ open: false });
    expect(fees).toHaveBeenCalledTimes(1);
    change({ universe: { ...UNIVERSE, indexer: "https://indexer.other" } });
    await settled();
    expect(fees).toHaveBeenCalledTimes(2);
    expect(fees).toHaveBeenLastCalledWith("https://indexer.other", { realm: NAMEREG, func: "Register" });
  });

  it("reports a fee read that threw, and draws the dialog all the same", async () => {
    const report = vi.fn();
    vi.stubGlobal("reportError", report);
    const boom = new Error("boom");
    flow({ fees: () => Promise.reject(boom) });
    await settled();
    expect(report).toHaveBeenCalledWith(boom);
    expect(props().fee).toBe(feeText(undefined));
  });
});

describe("RegisterFlow: what the dialog is told of a registration", () => {
  it("passes the account, the universe as the network, and whether it is open", () => {
    flow({ open: false });
    expect(props()).toMatchObject({ open: false, account: ACCOUNT, network: UNIVERSE, phase: { kind: "typing" } });
  });

  it("is registered for the dialog only when the chain's answer came: the name typed and its block, and the page is told it ran", async () => {
    const { onSettled } = flow();
    props().onRegister("alexis042");
    await vi.waitFor(() => {
      expect(props().phase).toEqual({ kind: "done", name: "nym-alexis042", height: 55_414 });
    });
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("says a name outside its form as a refusal, before any card, with the form left open and the page told", async () => {
    const { onSettled, wallet } = flow();
    props().onRegister("alex");
    await vi.waitFor(() => {
      expect(props().phase).toEqual({ kind: "failed", text: nymProblem("alex"), again: true });
    });
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(wallet.asked).toEqual([]);
    props().onRegister("alexis042");
    await vi.waitFor(() => {
      expect(props().phase).toMatchObject({ kind: "done" });
    });
  });

  it("says nothing was sent when the signing parts did not load, and asks Adena nothing", async () => {
    const { onSettled } = flow({ deps: undefined });
    props().onRegister("alexis042");
    await vi.waitFor(() => {
      expect(props().phase).toEqual({
        kind: "failed",
        text: "Part of gnoworld that signs did not load, so nothing was sent. Reload the page, then try again.",
        again: true,
      });
    });
    expect(onSettled).not.toHaveBeenCalled();
  });

  it("takes the parts the page loads when a test gives none", async () => {
    hoisted.load = () => Promise.resolve(partsOf(recordedAdena({ account: ACCOUNT })));
    flow({ deps: undefined });
    props().onRegister("alexis042");
    await vi.waitFor(() => {
      expect(props().phase).toMatchObject({ kind: "done" });
    });
  });

  it("reports a registration that threw, never silently", async () => {
    const report = vi.fn();
    vi.stubGlobal("reportError", report);
    const boom = new Error("boom");
    hoisted.load = () => Promise.reject(boom);
    flow({ deps: undefined });
    props().onRegister("alexis042");
    await vi.waitFor(() => {
      expect(report).toHaveBeenCalled();
    });
  });

  it("keeps saying the card's own wait when a second press was refused while Adena signs", async () => {
    const gate = Promise.withResolvers<unknown>();
    const wallet = recordedAdena({ account: ACCOUNT, doContract: () => gate.promise });
    flow({ deps: partsOf(wallet) });
    props().onRegister("alexis042");
    await vi.waitFor(() => {
      expect(wallet.asked.some((entry) => entry.call === "DoContract")).toBe(true);
    });
    props().onRegister("alexis043");
    await settled();
    expect(props().phase).toEqual({ kind: "working", text: "Waiting for your signature in Adena…" });
    gate.resolve({ status: "failure", type: "TRANSACTION_REJECTED", message: "", data: {} });
  });
});
