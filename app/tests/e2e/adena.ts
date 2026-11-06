import type { Page } from "./fixtures.ts";

// A stand-in for Adena, for the journeys that log in (slice 4's 4a). It answers as Adena's SDK types it and
// signs through the host's test wallet of that name (serve.mjs, /__sign?as=), as signer.ts does for the server's
// tests; it keeps what it was asked to sign.
type Mode = "signs" | "declines" | "locked";
export async function adena(page: Page, mode: Mode = "signs", as = ""): Promise<void> {
  await page.addInitScript(
    ([how, name]: [Mode, string]) => {
      const as = `?as=${encodeURIComponent(name)}`;
      const answer = (status: string, type: string, data: unknown) => ({ code: 0, status, type, message: "", data });
      const wallet = async (): Promise<{ address: string }> =>
        (await fetch(`/__wallet${as}`)).json() as Promise<{ address: string }>;
      const asked: unknown[] = [];
      // Adena's events: the listeners kept as the SDK keeps them, for a journey to emit (adena.emit below).
      const listeners: Record<string, ((value: unknown) => void)[]> = {};
      Object.assign(window, {
        __asked: asked,
        __emit: (event: string, value: unknown) => {
          for (const listener of listeners[event] ?? []) listener(value);
        },
        adena: {
          On: (event: string, listener: (value: unknown) => void) => {
            (listeners[event] ??= []).push(listener);
          },
          AddEstablish: () => Promise.resolve(answer("success", "CONNECTION_SUCCESS", {})),
          GetAccount: async () =>
            how === "locked"
              ? answer("failure", "WALLET_LOCKED", {})
              : answer("success", "GET_ACCOUNT", { ...(await wallet()), chainId: "onyx-1", status: "ACTIVE" }),
          GetNetwork: () =>
            Promise.resolve(answer("success", "GET_NETWORK", { chainId: "onyx-1", networkName: "Onyx" })),
          SignArbitrary: async (params: { signer: string; data: string }) => {
            asked.push(params);
            if (how === "declines") return answer("failure", "SIGN_REJECTED", {});
            const signed: unknown = await (
              await fetch(`/__sign${as}`, { method: "POST", body: JSON.stringify({ chainId: "onyx-1", ...params }) })
            ).json();
            return answer("success", "SIGN_ARBITRARY", signed);
          },
        },
      });
    },
    [mode, as] as [Mode, string],
  );
}

/** Has the stand-in tell the page that Adena's account changed to `address`, as the extension does. */
export const changeAccount = (page: Page, address: string): Promise<void> =>
  page.evaluate((to) => {
    (window as unknown as { __emit: (event: string, value: unknown) => void }).__emit("changedAccount", to);
  }, address);
