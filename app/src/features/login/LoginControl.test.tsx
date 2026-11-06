// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, click, mount, settled } from "../../../tests/mount.tsx";
import { StoreProvider } from "../../storeContext.tsx";
import type { SessionDeps } from "./logIn.ts";
import { Account } from "./testing/Account.tsx";

// The login in the header (4a): the session read as the page starts, again on the waits the page's leaving cancels; Adena's code asked at
// the click that logs in, with the page's own Adena, its connect and its signer; a logout. What logIn.ts does with them is its own test's.
const flow = vi.hoisted(() => ({
  knowSession: vi.fn<(deps: unknown, wait: (ms: number) => Promise<void>) => Promise<void>>(),
  logIn: vi.fn<(adena: unknown, deps: unknown) => Promise<void>>(),
  logOut: vi.fn<(deps: unknown) => Promise<void>>(),
  adena: { connect: vi.fn(), signLogin: vi.fn(), pageAdena: vi.fn(() => "the page's Adena") },
}));
vi.mock("./logIn.ts", () => ({ knowSession: flow.knowSession, logIn: flow.logIn, logOut: flow.logOut }));
vi.mock("../../lib/adena/adena.ts", () => flow.adena);

// jsdom has no reportError: the page's own, where an error the control cannot act on goes.
const reported = vi.fn();
beforeEach(() => {
  vi.stubGlobal("reportError", reported);
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});


const depsOf = (call: unknown[] | undefined) => call?.[0] as SessionDeps;

describe("the login control", () => {
  it("reads the session as it starts, logs in with the page's Adena at a click, and out", async () => {
    flow.knowSession.mockImplementation((deps) => {
      (deps as SessionDeps).store.getState().loginActions.signedOut();
      return Promise.resolve();
    });
    flow.logIn.mockResolvedValue(undefined);
    flow.logOut.mockResolvedValue(undefined);
    const box = mount(
      <StoreProvider>
        <Account />
      </StoreProvider>,
    );
    await settled(() => button(box, "Connect Adena") !== undefined);
    const deps = depsOf(flow.knowSession.mock.calls[0]);
    expect(deps.store).toBeDefined();
    expect(deps.api).toBeDefined();
    expect(flow.adena.pageAdena).not.toHaveBeenCalled();
    click(button(box, "Connect Adena"));
    await settled(() => flow.logIn.mock.calls.length > 0);
    expect(flow.logIn).toHaveBeenCalledWith("the page's Adena", {
      ...deps,
      connect: flow.adena.connect,
      sign: flow.adena.signLogin,
    });
    deps.store.getState().loginActions.signedIn("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5" as never);
    await settled(() => button(box, "Log out") !== undefined);
    click(button(box, "Log out"));
    expect(flow.logOut).toHaveBeenCalledWith(deps);
  });

  it("lets a wait for the session go when the page leaves", async () => {
    vi.useFakeTimers();
    let waited: Promise<void> | undefined;
    flow.knowSession.mockImplementation(async (_, wait) => {
      waited = wait(1000);
      await waited;
    });
    const root = createRoot(document.body.appendChild(document.createElement("div")));
    act(() => {
      root.render(
        <StoreProvider>
          <Account />
        </StoreProvider>,
      );
    });
    expect(waited).toBeDefined();
    const ended = vi.fn();
    waited?.then(ended, ended);
    act(() => {
      root.unmount();
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(ended).not.toHaveBeenCalled();
  });

  it("reports a login that fails, and stays", async () => {
    flow.knowSession.mockImplementation((deps) => {
      (deps as SessionDeps).store.getState().loginActions.signedOut();
      return Promise.resolve();
    });
    flow.logIn.mockRejectedValue(new Error("refused"));
    const box = mount(
      <StoreProvider>
        <Account />
      </StoreProvider>,
    );
    await settled(() => button(box, "Connect Adena") !== undefined);
    click(button(box, "Connect Adena"));
    await settled(() => reported.mock.calls.length > 0);
    expect(reported).toHaveBeenCalledWith(new Error("refused"));
    expect(button(box, "Connect Adena")).toBeDefined();
  });
});
