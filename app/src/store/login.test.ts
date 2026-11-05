import { Address } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { createAppStore } from "./index.ts";

const ADDRESS = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");

describe("the store's login slice", () => {
  it("starts knowing nobody: no session read yet, no login under way, no link to Ergo", () => {
    expect(createAppStore().getState().login).toEqual({
      session: { kind: "unknown" },
      step: "idle",
      problem: undefined,
      chat: "off",
    });
  });

  it("follows a login's steps, then holds the account logged in", () => {
    const store = createAppStore();
    const { begin, signedIn } = store.getState().loginActions;
    begin("wallet");
    expect(store.getState().login.step).toBe("wallet");
    begin("signing");
    begin("verifying");
    expect(store.getState().login.step).toBe("verifying");
    signedIn(ADDRESS);
    expect(store.getState().login).toEqual({
      session: { kind: "in", address: ADDRESS },
      step: "idle",
      problem: undefined,
      chat: "off",
    });
  });

  it("keeps why a login stopped until the next one begins", () => {
    const store = createAppStore();
    const { begin, stopped } = store.getState().loginActions;
    begin("wallet");
    stopped({ reason: "locked" });
    expect(store.getState().login).toMatchObject({ step: "idle", problem: { reason: "locked" } });
    begin("wallet");
    expect(store.getState().login.problem).toBeUndefined();
  });

  it("forgets the account on a logout, and the link to Ergo with it", () => {
    const store = createAppStore();
    const { signedIn, chat, signedOut } = store.getState().loginActions;
    signedIn(ADDRESS);
    chat("connected");
    signedOut();
    expect(store.getState().login).toEqual({ session: { kind: "out" }, step: "idle", problem: undefined, chat: "off" });
  });

  it("follows the link to Ergo", () => {
    const store = createAppStore();
    store.getState().loginActions.chat("waiting");
    expect(store.getState().login.chat).toBe("waiting");
  });

  it("makes a store of its own each time: two never share their state", () => {
    const one = createAppStore();
    const two = createAppStore();
    one.getState().loginActions.signedIn(ADDRESS);
    expect(two.getState().login.session).toEqual({ kind: "unknown" });
  });

  it("tells each subscriber once per change, never when nothing changed", () => {
    const store = createAppStore();
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    store.getState().loginActions.begin("wallet");
    store.getState().loginActions.begin("wallet");
    expect(calls).toBe(1);
  });
});
