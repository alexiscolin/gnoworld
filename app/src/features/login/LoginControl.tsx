// The login in the page: the session read once as the page starts, a login with the page's Adena, a logout.
import { useEffect, useState } from "react";
import { connect, pageAdena, signLogin } from "../../lib/adena/adena.ts";
import { pageLoginApi } from "../../lib/api/login.ts";
import { useApp, useAppStore } from "../../storeContext.tsx";
import { logIn, logOut, readSession, type LoginDeps } from "./logIn.ts";
import { LoginView } from "./LoginView.tsx";

export function LoginControl() {
  const store = useAppStore();
  const [deps] = useState<LoginDeps>(() => ({ connect, sign: signLogin, api: pageLoginApi(), store }));
  const login = useApp((state) => state.login);
  useEffect(() => {
    readSession(deps).catch(reportError);
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
