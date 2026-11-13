// @vitest-environment jsdom
import type { ChainRead } from "@gnoworld/chain/read";
import { Address } from "@gnoworld/schemas";
import { notifyManager } from "@tanstack/react-query";
import { act, useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { mount } from "../../../tests/mount.tsx";
import type { Named, readName } from "../../lib/chain/names.ts";
import { queryClient } from "../../lib/query/client.ts";
import { NameLabel } from "./Label.tsx";

// 9f in the account's menu: the pill's name is mainnet's, else Onyx's, else the short address; a name can be picked only once the
// universe's own chain has answered that the account has none there.
const ACCOUNT = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const source = { url: "https://rpc", at: "2026-11-06T05:00:00.000Z" };
const named = (chainId: string, name: string | null): ChainRead<Named> => ({
  ok: true,
  value: { chainId, name, height: 55_420 },
  source,
});
const reader =
  (answers: Record<string, ChainRead<Named>>): typeof readName =>
  (_rpc, { chainId }) =>
    Promise.resolve(answers[chainId] ?? { ok: false, failure: { kind: "down", next: "Try again." }, source });

describe("the account's name label", () => {
  it("shows mainnet's name with its chain and block, and offers nothing to pick", async () => {
    const onPickable = vi.fn();
    const read = reader({ "gnoland-1": named("gnoland-1", "nym-main042"), "onyx-1": named("onyx-1", "nym-onyx042") });
    const box = mount(<NameLabel account={ACCOUNT} universe="onyx" again={0} onPickable={onPickable} read={read} />);
    await vi.waitFor(() => {
      expect(box.textContent).toBe("nym-main042");
    });
    expect(box.querySelector("[data-account]")?.getAttribute("title")).toMatch(/gno\.land · block 55,420/);
    expect(onPickable).toHaveBeenLastCalledWith(false);
  });

  it("shows the short address and offers a name to pick when the universe's chain says it has none", async () => {
    const onPickable = vi.fn();
    const read = reader({ "gnoland-1": named("gnoland-1", null), "onyx-1": named("onyx-1", null) });
    const box = mount(<NameLabel account={ACCOUNT} universe="onyx" again={0} onPickable={onPickable} read={read} />);
    await vi.waitFor(() => {
      expect(onPickable).toHaveBeenCalledWith(true);
    });
    expect(box.textContent).toBe("g1jg8m…vsqf5");
  });

  it("offers nothing to pick while the universe's chain does not answer", async () => {
    const onPickable = vi.fn();
    const box = mount(
      <NameLabel account={ACCOUNT} universe="onyx" again={0} onPickable={onPickable} read={reader({})} />,
    );
    await vi.waitFor(() => {
      expect(onPickable).toHaveBeenCalled();
    });
    expect(onPickable).not.toHaveBeenCalledWith(true);
    expect(box.textContent).toBe("g1jg8m…vsqf5");
  });
});

// The reads behind the label (useReads), each kept by chain, account and registration: the next account never shows the last one's name.
describe("the account's name label, as its account changes or a registration runs", () => {
  const OTHER = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
  // The query tells its readers in a microtask, so they know before the test's next turn.
  beforeAll(() => {
    notifyManager.setScheduler(queueMicrotask);
  });
  const nextTick = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  // The label as the menu holds it: its account and `again` change under it.
  function label(read: typeof readName) {
    queryClient.clear();
    const onPickable = vi.fn();
    let told: (next: { account?: string; again?: number }) => void = () => undefined;
    const Host = () => {
      const [shown, setShown] = useState<{ account: string; again: number }>({ account: ACCOUNT, again: 0 });
      told = (next) => {
        setShown((before) => ({ ...before, ...next }));
      };
      return <NameLabel {...shown} universe="onyx" onPickable={onPickable} read={read} />;
    };
    const box = mount(<Host />);
    const change = (next: { account?: string; again?: number }) => {
      act(() => {
        told(next);
      });
    };
    return { box, change };
  }

  it("shows the new account's own reads when the old account's answer comes after the switch, never the old one's name", async () => {
    const held = Promise.withResolvers<ChainRead<Named>>();
    const read: typeof readName = (_rpc, { chainId, account }) => {
      if (account === ACCOUNT && chainId === "gnoland-1") return held.promise;
      return Promise.resolve(named(chainId, chainId === "onyx-1" && account === OTHER ? "nym-bobname042" : null));
    };
    const { box, change } = label(read);
    change({ account: OTHER });
    await nextTick();
    held.resolve(named("gnoland-1", "nym-alicename042"));
    await nextTick();
    expect(box.textContent).toBe("nym-bobname042");
  });

  it("shows no name of the old account while the new account's reads are not answered", async () => {
    const read: typeof readName = (_rpc, { chainId, account }) =>
      account === ACCOUNT ? Promise.resolve(named(chainId, "nym-alicename042")) : new Promise(() => undefined);
    const { box, change } = label(read);
    await nextTick();
    expect(box.textContent).toBe("nym-alicename042");
    change({ account: OTHER });
    await nextTick();
    expect(box.textContent).toBe("g10gh7…3y5tv");
  });

  it("reads both chains again after each registration that ran, the second time as the first", async () => {
    const asked: string[] = [];
    const read: typeof readName = (_rpc, { chainId }) => {
      asked.push(chainId);
      return Promise.resolve(named(chainId, null));
    };
    const { change } = label(read);
    await nextTick();
    expect(asked).toHaveLength(2);
    change({ again: 1 });
    await vi.waitFor(() => {
      expect(asked).toHaveLength(4);
    });
    change({ again: 2 });
    await vi.waitFor(() => {
      expect(asked).toHaveLength(6);
    });
    expect(asked.toSorted()).toEqual(["gnoland-1", "gnoland-1", "gnoland-1", "onyx-1", "onyx-1", "onyx-1"]);
  });

  it("reports a read that threw, and still shows the short address", async () => {
    const report = vi.fn();
    vi.stubGlobal("reportError", report);
    try {
      const boom = new Error("boom");
      const { box } = label(() => Promise.reject(boom));
      await nextTick();
      expect(report).toHaveBeenCalledWith(boom);
      expect(box.textContent).toBe("g1jg8m…vsqf5");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
