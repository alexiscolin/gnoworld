import { realmType } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import { describe, expect, it, vi } from "vitest";
import { createAppStore } from "../../store/index.ts";
import { signInPage } from "./signPage.ts";
import { ensureCalls } from "./slice.ts";

// F5727: the parts a click on "Sign in Adena" loads come from lazy chunks; one that fails to load is a state with its next step,
// not a click that does nothing.
vi.mock("../../lib/adena/adena.ts", () => {
  throw new Error("Failed to fetch dynamically imported module");
});
const ONYX = { chainId: "onyx-1", name: "Onyx", rpc: "https://rpc.onyx.testnets.gno.land:443" };

describe("signInPage", () => {
  it("fails the card with a reload as its next step when a part of it does not load, and signs nothing", async () => {
    const store = ensureCalls(createAppStore());
    store.getState().loginActions.signedIn(Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5"));
    store.getState().callsActions.open({
      id: "a",
      chainId: "onyx-1",
      realm: "gno.land/r/demo/profile",
      func: "SetBio",
      params: [
        { Name: "cur", Type: realmType() },
        { Name: "bio", Type: "string" },
      ],
    });
    await signInPage("a", store, ONYX);
    expect(store.getState().calls["a"]?.state).toEqual({ kind: "failed", reason: "not-loaded" });
  });
});
