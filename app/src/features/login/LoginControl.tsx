// The login in the page: the session read as the page starts, again until the server says, a login with the page's Adena, a logout.
import { useEffect, useState } from "react";
import { pageLoginApi } from "../../lib/api/login.ts";
import { useApp, useAppStore } from "../../storeContext.tsx";
import { knowSession, logIn, logOut, watchAccount, type SessionDeps } from "./logIn.ts";
import { LoginView } from "./LoginView.tsx";

// Adena's calls come with the first click that logs in: a page that never logs in does not load them.
async function logInWithAdena(deps: SessionDeps): Promise<void> {
  const [{ connect, pageAdena, signLogin }, { listen }] = await Promise.all([
    import("../../lib/adena/adena.ts"),
    import("../../lib/adena/events.ts"),
  ]);
  watchAccount(pageAdena(), { ...deps, listen });
  await logIn(pageAdena(), { ...deps, connect, sign: signLogin });
}

export function LoginControl() {
  const store = useAppStore();
  const [deps] = useState<SessionDeps>(() => ({ api: pageLoginApi(), store }));
  const login = useApp((state) => state.login);
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
