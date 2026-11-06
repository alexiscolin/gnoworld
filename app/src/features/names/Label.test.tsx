// @vitest-environment jsdom
import type { ChainRead } from "@gnoworld/chain/read";
import { Address } from "@gnoworld/schemas";
import { describe, expect, it, vi } from "vitest";
import { mount } from "../../../tests/mount.tsx";
import type { Named, readName } from "../../lib/chain/names.ts";
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
