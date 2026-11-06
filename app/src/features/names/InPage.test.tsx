// @vitest-environment jsdom
import { queryEnvelope, statusEnvelope } from "@gnoworld/chain/testing/envelopes";
import { Address } from "@gnoworld/schemas";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { button, click, mount, one } from "../../../tests/mount.tsx";
import { StoreProvider } from "../../storeContext.tsx";
import InPage from "./InPage.tsx";

// The page's own parts: the universe the path names, and the two chains the name is read on, from the data files.
const ACCOUNT = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const PICK = "Pick a name for g1jg8m…vsqf5";
afterEach(() => {
  vi.unstubAllGlobals();
});

// Two nodes that answer the status and say the account has no record, and an indexer that does not answer.
function at(universe?: string) {
  const asked = vi.fn<(url: string) => Promise<Response>>((url) => {
    const { host, pathname } = new URL(url);
    if (host.includes("indexer")) return Promise.reject(new TypeError("offline"));
    const body =
      pathname === "/status"
        ? statusEnvelope(55_420, "2026-11-06T05:00:00Z", host.startsWith("rpc.onyx.") ? "onyx-1" : "gnoland-1")
        : queryEnvelope({ data: "(true bool)" });
    return Promise.resolve(new Response(JSON.stringify(body)));
  });
  vi.stubGlobal("fetch", (url: string) => asked(url));
  const box = mount(
    <StoreProvider>
      <InPage account={ACCOUNT} universe={universe} pill="pill" />
    </StoreProvider>,
  );
  return { box, asked };
}

// The text of the dialog the pill opens, once what it needs has loaded.
async function opened(universe?: string) {
  const { box } = at(universe);
  await vi.waitFor(() => {
    expect(button(box, PICK)).toBeDefined();
  });
  click(button(box, PICK));
  await vi.waitFor(() => {
    expect(one(box, "dialog").hasAttribute("open")).toBe(true);
  });
  return one(box, "dialog").textContent;
}

describe("InPage", () => {
  it("reads the name on gno.land and on Onyx, and draws it in the pill it is given", async () => {
    const { box, asked } = at();
    await act(() => Promise.resolve());
    const hosts = asked.mock.calls.map(([url]) => new URL(url).host);
    expect(hosts).toContain("rpc.gno.land");
    expect(hosts.some((host) => host.startsWith("rpc.onyx."))).toBe(true);
    expect(one(box, "[data-account]").className).toContain("pill");
  });

  it("registers on the data's default universe, Onyx, when none or an unknown one is named, and on gno.land's, in real GNOT, on `gnoland`", async () => {
    expect(await opened()).toContain("Onyx (onyx-1)");
    expect(await opened("nowhere")).toContain("Onyx (onyx-1)");
    const main = await opened("gnoland");
    expect(main).toContain("gno.land (gnoland-1)");
    expect(main).toMatch(/real GNOT/);
  });

  it("takes each chain's name from its own node: a name only gno.land's node knows is shown as gno.land's", async () => {
    vi.stubGlobal("fetch", (url: string) => {
      const { host, pathname } = new URL(url);
      const hex = /data=0x([0-9a-f]*)/.exec(url)?.[1] ?? "";
      const asked = new TextDecoder().decode(
        Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16)),
      );
      const onyx = host.startsWith("rpc.onyx.");
      const data = asked.endsWith(".Name()") ? '("nym-mainname042" string)' : onyx ? "(true bool)" : "(false bool)";
      const body =
        pathname === "/status"
          ? statusEnvelope(55_420, "2026-11-06T05:00:00Z", onyx ? "onyx-1" : "gnoland-1")
          : queryEnvelope({ data });
      return Promise.resolve(new Response(JSON.stringify(body)));
    });
    const box = mount(
      <StoreProvider>
        <InPage account={ACCOUNT} universe={undefined} pill="pill" />
      </StoreProvider>,
    );
    await vi.waitFor(() => {
      expect(one(box, "[data-account]").title).toBe("gno.land · block 55,420");
    });
    expect(one(box, "[data-account]").textContent).toContain("nym-mainname042");
  });
});
