// The login in the page: the session read as the page starts, again until the server says, a login with the page's Adena, a logout.
import { useEffect, useState } from "react";
import { connect, pageAdena, signLogin } from "../../lib/adena/adena.ts";
import { pageLoginApi } from "../../lib/api/login.ts";
import { useApp, useAppStore } from "../../storeContext.tsx";
import { knowSession, logIn, logOut, type LoginDeps } from "./logIn.ts";
import { LoginView } from "./LoginView.tsx";

export function LoginControl() {
  const store = useAppStore();
  const [deps] = useState<LoginDeps>(() => ({ connect, sign: signLogin, api: pageLoginApi(), store }));
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
        logIn(pageAdena(), deps).catch(reportError);
      }}
      onLogOut={() => {
        logOut(deps).catch(reportError);
      }}
    />
  );
}
