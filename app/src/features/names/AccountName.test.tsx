// @vitest-environment jsdom
import type { ChainRead } from "@gnoworld/chain/read";
import { Address } from "@gnoworld/schemas";
import { Avatar } from "@gnoworld/ui";
import type { Landed } from "@gnoworld/chain/tx";
import { act, useState } from "react";
import { notifyManager } from "@tanstack/react-query";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { all, button, click, faceOf, mount, one } from "../../../tests/mount.tsx";
import { recordedAdena } from "../../../tests/recordedAdena.ts";
import { callContract } from "../../lib/adena/call.ts";
import type { CallFees } from "@gnoworld/chain/fees";
import type { readName, Named } from "../../lib/chain/names.ts";
import { queryClient } from "../../lib/query/client.ts";
import { StoreProvider, useAppStore } from "../../storeContext.tsx";
import { AccountName } from "./AccountName.tsx";

// 9f: the account control's name, mainnet's else Onyx's else the short address, each read live with its height; "Pick a name"
// only for an account logged in with no name on THIS universe's chain, and only once that read answered; a name registered is
// shown only when a read of the chain gives it, never because Adena or the card said so.
const ACCOUNT = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const CHAINS = {
  mainnet: { chainId: "gnoland-1", rpc: "https://rpc.gno.land:443" },
  onyx: { chainId: "onyx-1", rpc: "https://rpc.onyx.testnets.gno.land:443" },
};
const ONYX_UNIVERSE = { id: "onyx", name: "Onyx", real: false, indexer: "https://indexer.onyx", ...CHAINS.onyx };
const MAIN_UNIVERSE = {
  id: "gnoland",
  name: "gno.land",
  real: true,
  indexer: "https://indexer.main",
  ...CHAINS.mainnet,
};
const source = { url: "https://rpc", at: "2026-11-06T05:00:00.000Z" };

const named = (chainId: string, name: string | null, height = 55_420): ChainRead<Named> => ({
  ok: true,
  value: { chainId, name, height },
  source,
});
const down = (): ChainRead<Named> => ({
  ok: false,
  failure: { kind: "down", next: "The chain's service did not answer. Try again in a moment." },
  source,
});
type Answers = Partial<Record<"gnoland-1" | "onyx-1", () => ChainRead<Named>>>;
const NONE: Answers = { "gnoland-1": () => named("gnoland-1", null), "onyx-1": () => named("onyx-1", null) };
// A reader that answers by the chain it is asked on, and keeps what it was asked.
function reader(answers: Answers) {
  const asked: { rpc: string; chainId: string; account: string }[] = [];
  const read: typeof readName = (rpc, { chainId, account }) => {
    asked.push({ rpc, chainId, account });
    const answer = answers[chainId as keyof Answers];
    return Promise.resolve(answer === undefined ? down() : answer());
  };
  return { read, asked };
}

interface Options {
  wallet?: ReturnType<typeof recordedAdena>;
  /** A reader of its own, for a read that must be held. */
  read?: typeof readName;
  /** The chain's answer to the transaction's read, as the card follows its hash. */
  landing?: () => ChainRead<Landed>;
  account?: Address;
}
// The indexer's answer for the function's last calls: two Register calls, as the recording holds them (48,000 and 1,000,000 ugnot).
const FEES: CallFees = { fees: [48_000, 1_000_000], height: 56_773 };
const feeRead = () => Promise.resolve({ ok: true as const, value: FEES, source });
const LANDED = { height: 55_414, failed: false, data: "", log: "ok" };
const OTHER = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");

// The control as a page holds it: its account and universe change under it, as Adena's account and the page's route do.
function control(universe: typeof ONYX_UNIVERSE, answers: Answers, options: Options = {}) {
  const { wallet = recordedAdena({ account: ACCOUNT }), landing = () => ({ ok: true, value: LANDED, source }) } =
    options;
  // A control's reads are its own: a test that mounts two (other answers) must not find the first one's names held.
  queryClient.clear();
  const { read, asked } = options.read === undefined ? reader(answers) : { read: options.read, asked: [] };
  let store: ReturnType<typeof useAppStore> | undefined;
  let change: (next: { account?: Address; universe?: typeof ONYX_UNIVERSE }) => void = () => undefined;
  const Probe = () => {
    store = useAppStore();
    return null;
  };
  const Host = () => {
    const [shown, setShown] = useState({ account: options.account ?? ACCOUNT, universe });
    change = (next) => {
      setShown((before) => ({ ...before, ...next }));
    };
    return (
      <AccountName
        {...shown}
        chains={CHAINS}
        read={read}
        fees={feeRead}
        deps={{
          adena: wallet.adena,
          call: callContract,
          read: () => Promise.resolve(landing()),
          wait: () => Promise.resolve(),
          watch: () => undefined,
        }}
      />
    );
  };
  const box = mount(
    <StoreProvider>
      <Probe />
      <Host />
    </StoreProvider>,
  );
  store?.getState().loginActions.signedIn(options.account ?? ACCOUNT);
  const switchTo = (next: { account?: Address; universe?: typeof ONYX_UNIVERSE }) => {
    if (next.account !== undefined) store?.getState().loginActions.signedIn(next.account);
    act(() => {
      change(next);
    });
  };
  return { box, asked, wallet, switchTo };
}
// The person's way through the dialog: types what follows `nym-`, then presses Register.
function typeName(box: HTMLElement, typed = "alexis042") {
  const input = one(box, "input");
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, typed);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function register(box: HTMLElement, typed = "alexis042") {
  typeName(box, typed);
  click(button(box, "Register · 0 GNOT"));
}
// The query tells its readers in a timer by default, which raced this timer turn under load (3 runs in 8 failed): told in a microtask,
// they know before the turn ends.
beforeAll(() => {
  notifyManager.setScheduler(queueMicrotask);
});
const settled = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
// The pill is the way in; the dialog and what signs load on that first ask, so it is there a moment later.
async function pick(box: HTMLElement) {
  click(button(box, PICK));
  await vi.waitFor(() => {
    expect(one(box, "dialog").hasAttribute("open")).toBe(true);
  });
}
const said = (box: Element) => box.textContent.replaceAll(/\s+/g, " ").trim();
const SHORT = "g1jg8m…vsqf5";
// The pill's name for assistive technology holds the words it shows.
const PICK = `Pick a name for ${SHORT}`;
// The pill whatever it shows: a mainnet name on a universe with none is still a way to pick one.
const offered = (box: HTMLElement) =>
  all(box, "button").find((each) => each.getAttribute("aria-label")?.startsWith("Pick a name for "));

describe("AccountName: the name shown", () => {
  it("shows the short address until a read answers, and reads each chain once, on its own node, for the logged-in account", async () => {
    const { box, asked } = control(ONYX_UNIVERSE, { "gnoland-1": () => named("gnoland-1", null) });
    expect(said(box)).toContain(SHORT);
    expect(button(box, PICK)).toBeUndefined();
    await settled();
    expect(asked.map(({ rpc, chainId }) => `${chainId} ${rpc}`).toSorted()).toEqual([
      `gnoland-1 ${CHAINS.mainnet.rpc}`,
      `onyx-1 ${CHAINS.onyx.rpc}`,
    ]);
    expect(asked.every(({ account }) => account === ACCOUNT)).toBe(true);
  });

  it("shows mainnet's name first, with its chain and height as its title", async () => {
    const { box } = control(ONYX_UNIVERSE, {
      "gnoland-1": () => named("gnoland-1", "nym-mainname042", 1_325_774),
      "onyx-1": () => named("onyx-1", "nym-onyxname042"),
    });
    await settled();
    expect(said(box)).toContain("nym-mainname042");
    expect(said(box)).not.toContain("nym-onyxname042");
    const shown = one(box, "[data-account]");
    expect(shown.title).toContain("gno.land");
    expect(shown.title).toContain("1,325,774");
  });

  it("shows Onyx's name when mainnet has none or did not answer, then the short address when neither gives one", async () => {
    const onyx = control(ONYX_UNIVERSE, { "gnoland-1": down, "onyx-1": () => named("onyx-1", "nym-onyxname042") });
    await settled();
    expect(said(onyx.box)).toContain("nym-onyxname042");
    const none = control(ONYX_UNIVERSE, {
      "gnoland-1": () => named("gnoland-1", null),
      "onyx-1": () => named("onyx-1", null),
    });
    await settled();
    expect(said(none.box)).toContain(SHORT);
    expect(said(one(none.box, "[data-account]"))).not.toContain("nym-");
  });
});

describe("AccountName: who is offered a name", () => {
  it("offers 'Pick a name' to an account with no name on this universe's chain, and opens the dialog on it", async () => {
    const { box } = control(ONYX_UNIVERSE, {
      "gnoland-1": () => named("gnoland-1", null),
      "onyx-1": () => named("onyx-1", null),
    });
    await settled();
    expect(all(box, "dialog")).toHaveLength(0);
    await pick(box);
    expect(one(box, "dialog").hasAttribute("open")).toBe(true);
    expect(said(one(box, "dialog"))).toContain("Pick a name and a face");
  });

  it("makes the account's pill itself the way in, with the person's face before the short address, and no other control", async () => {
    const { box } = control(ONYX_UNIVERSE, NONE);
    await settled();
    const pill = button(box, PICK);
    expect(pill?.hasAttribute("data-account")).toBe(true);
    expect(said(pill ?? box)).toContain(SHORT);
    expect(faceOf(pill ?? box)).toBe(faceOf(mount(<Avatar address={ACCOUNT} name="you" />)));
    expect(all(box, "button")).toHaveLength(1);
  });

  it("draws the face before a name too, in a pill that is no button when the name is there", async () => {
    const { box } = control(ONYX_UNIVERSE, { "gnoland-1": () => named("gnoland-1", "nym-mainname042") });
    await settled();
    expect(all(box, "button")).toHaveLength(0);
    expect(faceOf(one(box, "[data-account]"))).not.toBe("");
  });

  it("offers it to a mainnet-named account on Onyx's universe, which has no name on Onyx, and not on the universe that has one", async () => {
    const answers = { "gnoland-1": () => named("gnoland-1", "nym-mainname042"), "onyx-1": () => named("onyx-1", null) };
    const onOnyx = control(ONYX_UNIVERSE, answers);
    await settled();
    expect(offered(onOnyx.box)).toBeDefined();
    const onMain = control(MAIN_UNIVERSE, answers);
    await settled();
    expect(offered(onMain.box)).toBeUndefined();
  });

  it("offers nothing while the universe's chain has not answered, or failed to: an unknown name is not a free one", async () => {
    const { box } = control(ONYX_UNIVERSE, { "gnoland-1": () => named("gnoland-1", null), "onyx-1": down });
    await settled();
    expect(button(box, PICK)).toBeUndefined();
  });

  it("leaves the short address, closes, and registers nothing on Later", async () => {
    const { box, wallet } = control(ONYX_UNIVERSE, {
      "gnoland-1": () => named("gnoland-1", null),
      "onyx-1": () => named("onyx-1", null),
    });
    await settled();
    await pick(box);
    click(button(box, "Later"));
    expect(one(box, "dialog").hasAttribute("open")).toBe(false);
    expect(said(box)).toContain(SHORT);
    expect(wallet.asked.map((entry) => entry.call)).not.toContain("DoContract");
  });
});

describe("AccountName: registering", () => {
  it("shows the new name in the control only when a read of the chain gives it, not when the card is done, and closes on Done", async () => {
    let registered = false;
    const { box, wallet } = control(ONYX_UNIVERSE, {
      "gnoland-1": () => named("gnoland-1", null),
      "onyx-1": () => named("onyx-1", registered ? "nym-alexis042" : null, registered ? 55_414 : 55_410),
    });
    await settled();
    await pick(box);
    typeName(box);
    registered = true;
    click(button(box, "Register · 0 GNOT"));
    await vi.waitFor(() => {
      expect(said(one(box, "dialog"))).toMatch(/registered/i);
    });
    expect(wallet.asked.filter((entry) => entry.call === "DoContract")).toHaveLength(1);
    await vi.waitFor(() => {
      expect(said(one(box, "[data-account]"))).toContain("nym-alexis042");
    });
    click(button(box, "Done"));
    expect(one(box, "dialog").hasAttribute("open")).toBe(false);
  });

  it("says the fee as the median of the function's last calls, read from the universe's indexer when the dialog loads", async () => {
    const { box } = control(ONYX_UNIVERSE, NONE);
    await settled();
    await pick(box);
    await vi.waitFor(() => {
      expect(said(one(box, "dialog"))).toContain("Fee: ≈ 0.524 GNOT, an estimate from calls up to block 56,773.");
    });
  });

  it("keeps the short address when the chain, read again, still gives no name", async () => {
    const { box } = control(ONYX_UNIVERSE, {
      "gnoland-1": () => named("gnoland-1", null),
      "onyx-1": () => named("onyx-1", null),
    });
    await settled();
    await pick(box);
    typeName(box);
    click(button(box, "Register · 0 GNOT"));
    await vi.waitFor(() => {
      expect(said(one(box, "dialog"))).toMatch(/registered/i);
    });
    expect(said(one(box, "[data-account]"))).toContain(SHORT);
  });
});

const signed = (wallet: ReturnType<typeof recordedAdena>) =>
  wallet.asked.filter((entry) => entry.call === "DoContract").length;
const failing = (type: string) => () => Promise.resolve({ status: "failure", type, message: "", data: {} });

describe("AccountName: a registration that does not go through", () => {
  async function opened(options: Options) {
    const view = control(ONYX_UNIVERSE, NONE, options);
    await settled();
    await pick(view.box);
    return view;
  }
  const dialog = (box: HTMLElement) => one(box, "dialog");

  it("offers no second Register after Adena failed with no hash: the call may have been sent, a second signature could be paid twice", async () => {
    const wallet = recordedAdena({ account: ACCOUNT, doContract: failing("TRANSACTION_FAILED") });
    const { box } = await opened({ wallet });
    register(box);
    await vi.waitFor(() => {
      expect(said(dialog(box))).toMatch(/may have been sent/);
    });
    expect(button(box, "Register · 0 GNOT")).toBeUndefined();
    expect(box.querySelectorAll("input")).toHaveLength(0);
    expect(button(box, "Later")).toBeDefined();
    expect(said(dialog(box))).not.toMatch(/is registered/);
    expect(signed(wallet)).toBe(1);
  });

  it("says a declined signature may have gone and offers no second Register (9d-2)", async () => {
    const wallet = recordedAdena({ account: ACCOUNT, doContract: failing("TRANSACTION_REJECTED") });
    const { box } = await opened({ wallet });
    register(box);
    await vi.waitFor(() => {
      expect(said(dialog(box))).toMatch(/the signature was declined/);
    });
    expect(said(dialog(box))).toMatch(/check Adena's recent transactions/);
    expect(said(dialog(box))).not.toMatch(/is registered/);
    expect(button(box, "Register · 0 GNOT")).toBeUndefined();
    expect(signed(wallet)).toBe(1);
  });

  it("offers no second Register for a hash that never showed in a block: it may still land", async () => {
    const notLanded = () => ({
      ok: false as const,
      failure: { kind: "not-landed" as const, next: "The chain has not put this transaction in a block yet." },
      source,
    });
    const wallet = recordedAdena({ account: ACCOUNT });
    const { box } = await opened({ wallet, landing: notLanded });
    register(box);
    await vi.waitFor(() => {
      expect(said(dialog(box))).toMatch(/not known whether it succeeded/);
    });
    expect(button(box, "Register · 0 GNOT")).toBeUndefined();
    expect(box.querySelectorAll("input")).toHaveLength(0);
    expect(signed(wallet)).toBe(1);
  });

  it("shows the chain's own log when the realm refused the call, and offers another name: nothing changed on the chain", async () => {
    const refused = () => ({
      ok: true as const,
      value: { ...LANDED, failed: true, log: "susers: canonical collision" },
      source,
    });
    const wallet = recordedAdena({ account: ACCOUNT });
    const { box } = await opened({ wallet, landing: refused });
    register(box);
    await vi.waitFor(() => {
      expect(said(dialog(box))).toContain("susers: canonical collision");
    });
    expect(said(dialog(box))).not.toMatch(/is registered/);
    expect(button(box, "Register · 0 GNOT")).toBeDefined();
    register(box, "alexis043");
    await vi.waitFor(() => {
      expect(signed(wallet)).toBe(2);
    });
  });

  it("shows a paused registry's refusal as the chain's log, which is all that is known of it", async () => {
    const paused = () => ({ ok: true as const, value: { ...LANDED, failed: true, log: "namereg: paused" }, source });
    const { box } = await opened({ landing: paused });
    register(box);
    await vi.waitFor(() => {
      expect(said(dialog(box))).toContain("namereg: paused");
    });
  });

  it("says the fee is real GNOT, and the registry's price 0, on gno.land's universe", async () => {
    const view = control(MAIN_UNIVERSE, NONE, { wallet: recordedAdena({ account: ACCOUNT, chain: "gnoland-1" }) });
    await settled();
    await pick(view.box);
    expect(said(dialog(view.box))).toMatch(/real GNOT/);
    expect(said(dialog(view.box))).toMatch(/0 GNOT/);
    expect(said(dialog(view.box))).not.toMatch(/free/i);
  });
});

describe("AccountName: whose name, whose card", () => {
  const bob = "nym-bobname042";
  it("shows the new account's own reads when the old account's answer comes after the switch, never the old one's name", async () => {
    const held = Promise.withResolvers<ChainRead<Named>>();
    const read: typeof readName = (_rpc, { chainId, account }) => {
      if (account === ACCOUNT && chainId === "gnoland-1") return held.promise;
      return Promise.resolve(named(chainId, chainId === "onyx-1" && account === OTHER ? bob : null));
    };
    const { box, switchTo } = control(ONYX_UNIVERSE, {}, { read });
    switchTo({ account: OTHER });
    await settled();
    held.resolve(named("gnoland-1", "nym-alicename042"));
    await settled();
    expect(said(one(box, "[data-account]"))).toContain(bob);
    expect(said(box)).not.toContain("alicename");
  });

  it("offers 'Pick a name' by the universe the page is in now: a universe that has the name offers none", async () => {
    const { box, switchTo } = control(ONYX_UNIVERSE, {
      "gnoland-1": () => named("gnoland-1", "nym-mainname042"),
      "onyx-1": () => named("onyx-1", null),
    });
    await settled();
    expect(offered(box)).toBeDefined();
    switchTo({ universe: MAIN_UNIVERSE });
    expect(offered(box)).toBeUndefined();
  });

  it("starts the next account on an empty form: a registration done for the first is not the second's", async () => {
    const { box, switchTo } = control(ONYX_UNIVERSE, NONE);
    await settled();
    await pick(box);
    register(box);
    await vi.waitFor(() => {
      expect(said(one(box, "dialog"))).toMatch(/is registered/);
    });
    switchTo({ account: OTHER });
    await settled();
    expect(said(one(box, "dialog"))).not.toMatch(/is registered/);
    expect(box.querySelectorAll("input")).toHaveLength(1);
  });
});

describe("AccountName: the pill and its title", () => {
  const classesOf = (element: Element) => element.className.split(" ").filter((each) => each !== "");
  it("draws the way in with its own class and nothing else when the page gives no pill, and the page's pill before it when it does", async () => {
    const { box } = control(ONYX_UNIVERSE, NONE);
    await settled();
    expect(classesOf(button(box, PICK) ?? box)).toEqual([expect.stringMatching(/^_opener_/)]);
    expect(classesOf(one(box, "[data-account] > span"))).toEqual([expect.stringMatching(/^_row_/)]);
    const piled = mount(
      <StoreProvider>
        <AccountName account={ACCOUNT} universe={ONYX_UNIVERSE} chains={CHAINS} read={reader(NONE).read} pill="login" />
      </StoreProvider>,
    );
    await settled();
    expect(classesOf(button(piled, PICK) ?? piled)).toEqual(["login", expect.stringMatching(/^_opener_/)]);
  });

  it("titles a name with the chain it was read on and its block, and the short address with the whole address", async () => {
    const onyx = control(ONYX_UNIVERSE, {
      "gnoland-1": () => named("gnoland-1", null),
      "onyx-1": () => named("onyx-1", "nym-onyxname042"),
    });
    await settled();
    expect(one(onyx.box, "[data-account]").title).toBe("Onyx · block 55,420");
    const main = control(ONYX_UNIVERSE, { "gnoland-1": () => named("gnoland-1", "nym-mainname042", 1_325_774) });
    await settled();
    expect(one(main.box, "[data-account]").title).toBe("gno.land · block 1,325,774");
    const none = control(ONYX_UNIVERSE, NONE);
    await settled();
    expect(one(none.box, "[data-account]").title).toBe(ACCOUNT);
  });

  it("shows no name of the old account while the new account's reads are not answered", async () => {
    const read: typeof readName = (_rpc, { chainId, account }) =>
      account === ACCOUNT ? Promise.resolve(named(chainId, "nym-alicename042")) : new Promise(() => undefined);
    const { box, switchTo } = control(ONYX_UNIVERSE, {}, { read });
    await settled();
    expect(said(box)).toContain("nym-alicename042");
    switchTo({ account: OTHER });
    await settled();
    expect(said(box)).not.toContain("alicename");
    expect(said(box)).toContain("g10gh7…3y5tv");
  });
});

describe("AccountName: reads again, and what goes wrong", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads both chains again after each registration that ran, the second time as the first", async () => {
    // A call the realm refused changed nothing and may be signed again; a decline may not (9d-2).
    const refused = () => ({
      ok: true as const,
      value: { ...LANDED, failed: true, log: "susers: canonical collision" },
      source,
    });
    const { box, asked } = control(ONYX_UNIVERSE, NONE, { landing: refused });
    await settled();
    await pick(box);
    expect(asked).toHaveLength(2);
    register(box);
    await vi.waitFor(() => {
      expect(asked).toHaveLength(4);
    });
    register(box);
    await vi.waitFor(() => {
      expect(asked).toHaveLength(6);
    });
  });

  it("reports a read that threw, and a dialog that did not load, and still shows the short address", async () => {
    const report = vi.fn();
    vi.stubGlobal("reportError", report);
    const boom = new Error("boom");
    const { box } = control(ONYX_UNIVERSE, {}, { read: () => Promise.reject(boom) });
    await settled();
    expect(report).toHaveBeenCalledWith(boom);
    expect(said(box)).toContain(SHORT);
    vi.doMock("./RegisterFlow.tsx", () => {
      throw new Error("chunk");
    });
    try {
      const picked = control(ONYX_UNIVERSE, NONE);
      await settled();
      click(button(picked.box, PICK));
      await vi.waitFor(() => {
        expect(
          report.mock.calls.some(
            ([error]) => error instanceof Error && error.cause instanceof Error && error.cause.message === "chunk",
          ),
        ).toBe(true);
      });
      expect(all(picked.box, "dialog")).toHaveLength(0);
    } finally {
      await settled();
      vi.doUnmock("./RegisterFlow.tsx");
    }
  });
});
