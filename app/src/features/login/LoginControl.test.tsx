// @vitest-environment jsdom
import { Address } from "@gnoworld/schemas";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreProvider, useAppStore } from "../../storeContext.tsx";
import { LoginControl } from "./LoginControl.tsx";

// F5669: only the journeys mounted LoginControl, which StrykerJS does not run. The page's real login, its fetch and its
// window.adena faked: the session read, a login, an account change, a network change, the page's leaving.
const ADDRESS = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const OTHER = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const TEXT = "Sign in to gnoworld";

const json = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
// The server's login routes: nobody is logged in, a challenge, a proof that names its account, a logout.
function server(sessionDown = false) {
  const paths: string[] = [];
  const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    paths.push(path);
    if (path === "/api/login/me")
      return sessionDown ? Promise.resolve(new Response("", { status: 503 })) : json({ address: null });
    if (path === "/api/login/challenge")
      return json({ nonce: "_-09azAZxxxxxxxxxxxxxx", text: TEXT, expiresAt: "2026-10-25T10:00:00.000Z" });
    if (path === "/api/login/verify") return json({ address: ADDRESS });
    if (path === "/api/login/logout") return Promise.resolve(new Response(null, { status: 204 }));
    return Promise.reject(new Error(`unexpected ${path} ${String(init?.method)}`));
  });
  vi.stubGlobal("fetch", fetcher);
  return { paths };
}

// Adena as the extension answers: let in, the account and network, a signature of the text, and `On`, whose first
// listener of an event hears it.
function wallet() {
  const listeners = new Map<string, (value: unknown) => void>();
  const answer = (type: string, data: unknown) =>
    Promise.resolve({ code: 0, status: "success", type, message: "", data });
  const adena = {
    AddEstablish: () => answer("CONNECTION_SUCCESS", {}),
    GetAccount: () => answer("GET_ACCOUNT", { address: ADDRESS, chainId: "onyx-1" }),
    GetNetwork: () => answer("GET_NETWORK", { chainId: "onyx-1" }),
    SignArbitrary: (params: unknown) => {
      const { data, signer } = params as { data: string; signer: string };
      return answer("SIGN_ARBITRARY", {
        signed: {
          chain_id: "onyx-1",
          account_number: "0",
          sequence: "0",
          fee: { amount: [], gas: "0" },
          msgs: [{ type: "sign/MsgSignData", value: { signer, data: btoa(data) } }],
          memo: "",
        },
        signature: { pubKey: { typeUrl: "/tm.PubKeySecp256k1", value: "A".repeat(44) }, signature: "A".repeat(88) },
      });
    },
    On: (event: string, listener: (value: unknown) => void) => {
      if (!listeners.has(event)) listeners.set(event, listener);
    },
  };
  vi.stubGlobal("adena", adena);
  return { emit: (event: string, value: unknown) => listeners.get(event)?.(value), listeners };
}

type AppStore = ReturnType<typeof useAppStore>;
let root: Root | undefined;
let host: HTMLElement | undefined;
// The page's login control with its store, which a probe beside it hands back.
function mountControl(): { store: () => AppStore; unmount: () => void } {
  let found: AppStore | undefined;
  const Probe = () => {
    found = useAppStore();
    return null;
  };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <StoreProvider>
        <Probe />
        <LoginControl />
      </StoreProvider>,
    );
  });
  return {
    store: () => {
      if (found === undefined) throw new Error("the probe did not render");
      return found;
    },
    unmount: () => {
      act(() => {
        root?.unmount();
      });
      root = undefined;
    },
  };
}
const session = (store: () => AppStore) => store().getState().login.session;
const click = (label: string) => {
  const button = [...(host?.querySelectorAll("button") ?? [])].find((b) => b.textContent === label);
  if (button === undefined) throw new Error(`no button "${label}"`);
  act(() => {
    button.click();
  });
};

beforeAll(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  // jsdom has no popover API, which an icon button's tooltip asks for as it mounts.
  Object.assign(HTMLElement.prototype, { togglePopover: () => true });
});
const reported = vi.fn();
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  // jsdom has no reportError, where the control sends what a promise it started rejects with.
  reported.mockClear();
  vi.stubGlobal("reportError", reported);
});
afterEach(() => {
  expect(reported).not.toHaveBeenCalled();
  if (root !== undefined) act(() => root?.unmount());
  root = undefined;
  host?.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const sessionIs = (store: () => AppStore, expected: ReturnType<typeof session>) =>
  vi.waitFor(() => {
    expect(session(store)).toEqual(expected);
  });
// The control mounted, nobody logged in, then a click on its login: Adena's login done.
async function loggedIn() {
  const { paths } = server();
  const adena = wallet();
  const { store } = mountControl();
  await sessionIs(store, { kind: "out" });
  click("Log in with Adena");
  await sessionIs(store, { kind: "in", address: ADDRESS });
  return { paths, adena, store };
}
const count = (paths: string[], path: string) => paths.filter((one) => one === `/api/login/${path}`).length;

describe("LoginControl", () => {
  it("logs in with the page's Adena, then follows its account and its network", async () => {
    const { paths, adena, store } = await loggedIn();
    expect(store().getState().login.step).toBe("idle");
    expect(count(paths, "verify")).toBe(1);

    adena.emit("changedNetwork", "gnoland-1");
    adena.emit("changedAccount", ADDRESS);
    await vi.advanceTimersByTimeAsync(0);
    expect(session(store)).toEqual({ kind: "in", address: ADDRESS });
    expect(count(paths, "logout")).toBe(0);

    adena.emit("changedAccount", OTHER);
    await sessionIs(store, { kind: "out" });
    expect(count(paths, "logout")).toBe(1);
    expect(store().getState().login).toEqual({
      session: { kind: "out" },
      step: "idle",
      problem: undefined,
      chat: "off",
    });
  });

  it("logs out on the server when the person clicks Log out", async () => {
    const { paths, store } = await loggedIn();
    click("Log out");
    await sessionIs(store, { kind: "out" });
    expect(count(paths, "logout")).toBe(1);
  });

  it("registers Adena's two listeners once, however many logins the page makes", async () => {
    const { adena } = await loggedIn();
    expect([...adena.listeners.keys()].sort()).toEqual(["changedAccount", "changedNetwork"]);
  });

  it("asks the session again, a doubling wait apart, while the server cannot say, and no more once the page is left", async () => {
    const { paths } = server(true);
    const { unmount } = mountControl();
    const asked = () => count(paths, "me");
    await vi.advanceTimersByTimeAsync(0);
    expect(asked()).toBe(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(asked()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(asked()).toBe(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(asked()).toBe(3);

    unmount();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(asked()).toBe(3);
  });
});
