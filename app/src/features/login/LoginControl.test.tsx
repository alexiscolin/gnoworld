// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, click, mount, settled } from "../../../tests/mount.tsx";
import { StoreProvider } from "../../storeContext.tsx";
import { pageClock, type SessionDeps } from "./logIn.ts";
import { Account } from "./testing/Account.tsx";

// The login in the header (4a): the session read as the page starts, again on the page's clock (pageClock, real here), which the page's
// leaving stops; Adena's code asked at the click that logs in, with the page's own Adena, its connect and its signer; a logout. What
// logIn.ts does with them is its own test's.
const flow = vi.hoisted(() => ({
  knowSession:
    vi.fn<(deps: unknown, wait: (ms: number) => Promise<void>, rest?: () => Promise<void>) => Promise<void>>(),
  logIn: vi.fn<(adena: unknown, deps: unknown) => Promise<void>>(),
  logOut: vi.fn<(deps: unknown) => Promise<void>>(),
  adena: { connect: vi.fn(), signLogin: vi.fn(), pageAdena: vi.fn(() => "the page's Adena") },
}));
vi.mock("./logIn.ts", async (actual) => ({
  ...(await actual<typeof import("./logIn.ts")>()),
  knowSession: flow.knowSession,
  logIn: flow.logIn,
  logOut: flow.logOut,
}));
vi.mock("../../lib/adena/adena.ts", () => flow.adena);
// Each Adena the account's watch is handed, the real watch still run.
const watched = vi.hoisted(() => ({ adenas: [] as unknown[] }));
vi.mock("./watch.ts", async (actual) => {
  const real = await actual<typeof import("./watch.ts")>();
  return {
    ...real,
    watchAccount: (adena: unknown, deps: Parameters<typeof real.watchAccount>[1]) => {
      watched.adenas.push(adena);
      real.watchAccount(adena, deps);
    },
  };
});

// jsdom has no reportError: the page's own, where an error the control cannot act on goes.
const reported = vi.fn();
beforeEach(() => {
  vi.stubGlobal("reportError", reported);
});
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const depsOf = (call: unknown[] | undefined) => call?.[0] as SessionDeps;

// The account drawn in a root of its own, which the test unmounts as the page's leaving; under StrictMode's double mount if `strict`.
function drawn(strict = false) {
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  const account = (
    <StoreProvider>
      <Account />
    </StoreProvider>
  );
  act(() => {
    root.render(strict ? <StrictMode>{account}</StrictMode> : account);
  });
  return root;
}

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
    const root = drawn();
    expect(waited).toBeDefined();
    const ended = vi.fn();
    waited?.then(ended, ended);
    act(() => {
      root.unmount();
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(ended).not.toHaveBeenCalled();
  });

  it("gives knowSession the page's wait and rest, and stops both, timers and listeners, at the page's leaving", async () => {
    vi.useFakeTimers();
    const adds = vi.spyOn(document, "addEventListener");
    const removes = vi.spyOn(document, "removeEventListener");
    let clock: { wait: (ms: number) => Promise<void>; rest: (() => Promise<void>) | undefined } | undefined;
    flow.knowSession.mockImplementation((_, wait, rest) => {
      clock = { wait, rest };
      return new Promise(() => undefined);
    });
    const root = drawn();
    expect(typeof clock?.rest).toBe("function");
    const ended = vi.fn();
    clock?.rest?.().then(ended, ended);
    document.dispatchEvent(new Event("pointerdown"));
    await vi.advanceTimersByTimeAsync(0);
    expect(ended).toHaveBeenCalledTimes(1);
    const pending = vi.fn();
    clock?.wait(1000).then(pending, pending);
    clock?.rest?.().then(pending, pending);
    adds.mockClear();
    removes.mockClear();
    const listened = vi.spyOn(document, "addEventListener");
    act(() => {
      root.unmount();
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(listened).not.toHaveBeenCalled();
    expect(removes.mock.calls.map(([type, , options]) => [type, options])).toEqual(
      ["pointerdown", "wheel", "keydown", "visibilitychange"].map((type) => [type, { capture: true, passive: true }]),
    );
    document.dispatchEvent(new Event("pointerdown"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(pending).not.toHaveBeenCalled();
  });

  it("under StrictMode's second mount, the first mount's clock is stopped: one loop asks, never two", async () => {
    const clocks: (() => Promise<void>)[] = [];
    flow.knowSession.mockImplementation((_, _wait, rest) => {
      if (rest !== undefined) clocks.push(rest);
      return new Promise(() => undefined);
    });
    const root = drawn(true);
    expect(clocks).toHaveLength(2);
    const [first, second] = clocks.map((rest) => {
      const done = vi.fn();
      rest().then(done, done);
      return done;
    });
    document.dispatchEvent(new Event("pointerdown"));
    await Promise.resolve();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    act(() => {
      root.unmount();
    });
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

describe("the Adena a call card set (F5651)", () => {
  it("is followed for its account, and no Adena is watched before one is set", async () => {
    watched.adenas.length = 0;
    flow.knowSession.mockImplementation(() => new Promise(() => undefined));
    const root = drawn();
    await vi.dynamicImportSettled();
    expect(watched.adenas).toEqual([]);
    const adena = { On: vi.fn() };
    act(() => {
      depsOf(flow.knowSession.mock.calls[0]).store.setState({ wallet: adena });
    });
    await settled(() => watched.adenas.length > 0);
    expect(watched.adenas).toEqual([adena]);
    expect(adena.On).toHaveBeenCalled();
    act(() => {
      root.unmount();
    });
  });
});

describe("a login whose wallet code cannot be fetched", () => {
  it("says a new version is out on its button, reports it, and logs in with nothing", async () => {
    flow.knowSession.mockImplementation((deps) => {
      (deps as SessionDeps).store.getState().loginActions.signedOut();
      return Promise.resolve();
    });
    vi.doMock("../../lib/adena/adena.ts", () => {
      throw new Error("chunk");
    });
    try {
      const box = mount(
        <StoreProvider>
          <Account />
        </StoreProvider>,
      );
      await settled(() => button(box, "Connect Adena") !== undefined);
      click(button(box, "Connect Adena"));
      await settled(() => button(box, "Reload the page") !== undefined);
      expect(reported).toHaveBeenCalled();
      expect(flow.logIn).not.toHaveBeenCalled();
    } finally {
      vi.doMock("../../lib/adena/adena.ts", () => flow.adena);
    }
  });
});

describe("the page's clock on a real document", () => {
  it("hears a gesture in capture: a handler that stops it on its way up cannot hide it from the rest", async () => {
    const clock = pageClock(document);
    const button = document.body.appendChild(document.createElement("button"));
    button.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    const done = vi.fn();
    clock.rest().then(done, done);
    button.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await Promise.resolve();
    expect(done).toHaveBeenCalledTimes(1);
    clock.stop();
    button.remove();
  });
});
