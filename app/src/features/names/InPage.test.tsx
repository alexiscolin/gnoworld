// @vitest-environment jsdom
import { Address } from "@gnoworld/schemas";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, one } from "../../../tests/mount.tsx";
import { StoreProvider } from "../../storeContext.tsx";
import InPage from "./InPage.tsx";

// The page's own parts: the universe the path names, and the two chains the name is read on, from the data files.
const ACCOUNT = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
afterEach(() => {
  vi.unstubAllGlobals();
});

function at(universe?: string) {
  const asked = vi.fn<(url: string) => Promise<Response>>(() => Promise.reject(new TypeError("offline")));
  vi.stubGlobal("fetch", (url: string) => asked(url));
  const box = mount(
    <StoreProvider>
      <InPage account={ACCOUNT} universe={universe} pill="pill" />
    </StoreProvider>,
  );
  return { box, asked };
}

describe("InPage", () => {
  it("reads the name on gno.land and on Onyx, and draws it in the pill it is given", async () => {
    const { box, asked } = at();
    await act(() => Promise.resolve());
    const hosts = asked.mock.calls.map(([url]) => new URL(url).host);
    expect(hosts).toContain("rpc.gno.land");
    expect(hosts.some((host) => host.startsWith("rpc.onyx."))).toBe(true);
    expect(one(box, "[data-account]").className).toBe("pill");
  });

  it("registers on Onyx's chain on none named, and on gno.land's, in real GNOT, on the universe `gnoland`", () => {
    expect(one(at().box, "dialog").textContent).not.toMatch(/real GNOT/);
    expect(one(at("gnoland").box, "dialog").textContent).toMatch(/real GNOT/);
  });
});
