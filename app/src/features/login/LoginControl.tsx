// The login in the page: the session read as the page starts, again until the server says, a login with the page's Adena, a logout.
import { useEffect, useState } from "react";
import { pageLoginApi } from "../../lib/api/login.ts";
import { useApp, useAppStore } from "../../storeContext.tsx";
import { knowSession, logIn, logOut, type SessionDeps } from "./logIn.ts";
import { LoginView } from "./LoginView.tsx";

// Adena's account followed, loaded with the first gesture that needs a wallet: a login's click, a call card's (F5651).
async function follow(deps: SessionDeps, adena: unknown): Promise<void> {
  const { listen, watchAccount } = await import("./watch.ts");
  watchAccount(adena, { ...deps, listen });
}

// Adena's calls come with the first click that logs in: a page that never logs in does not load them.
async function logInWithAdena(deps: SessionDeps): Promise<void> {
  const { connect, pageAdena, signLogin } = await import("../../lib/adena/adena.ts");
  await follow(deps, pageAdena());
  await logIn(pageAdena(), { ...deps, connect, sign: signLogin });
}

export function LoginControl({ universe }: { universe?: string | undefined }) {
  const store = useAppStore();
  const [deps] = useState<SessionDeps>(() => ({ api: pageLoginApi(), store }));
  const login = useApp((state) => state.login);
  const wallet = useApp((state) => state.wallet);
  useEffect(() => {
    if (wallet !== undefined) follow(deps, wallet).catch(reportError);
  }, [deps, wallet]);
  useEffect(() => {
    // A wait the page's leaving cancels: the session is then asked no more.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      });
    knowSession(deps, wait).catch(reportError);
    return () => {
      clearTimeout(timer);
    };
  }, [deps]);
  return (
    <LoginView
      universe={universe}
      session={login.session}
      step={login.step}
      problem={login.problem}
      onLogIn={() => {
        logInWithAdena(deps).catch(reportError);
      }}
      onLogOut={() => {
        logOut(deps).catch(reportError);
      }}
    />
  );
}
