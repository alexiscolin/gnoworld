// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { addressState, restateAddress } from "./addressState.ts";

// A pick kept in one word of the address, which the router never hears: a navigation the router makes to an address without it leaves the
// pick standing, so it is written back, and a reload or a shared link opens with it.
afterEach(() => {
  history.replaceState(null, "", "/");
});

describe("a value kept in the address", () => {
  it("is written back into the address after a navigation left it out, and leaves the address alone when none is picked", () => {
    const view = addressState<"map">("view", (word) => (word === "map" ? "map" : undefined));
    const tag = addressState<"art">("tag", (word) => (word === "art" ? "art" : undefined));
    view.set("map");
    history.pushState(null, "", "/universe#passport");
    restateAddress();
    expect(location.pathname).toBe("/universe");
    expect(location.hash).toBe("#passport");
    expect(new URLSearchParams(location.search).get("view")).toBe("map");
    expect(new URLSearchParams(location.search).has("tag")).toBe(false);
    expect(tag.get()).toBeUndefined();
  });
});
