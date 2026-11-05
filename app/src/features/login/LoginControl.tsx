// The login in the page: the session read as the page starts, again until the server says, a login with the page's Adena, a logout. The
// header's account menu holds the way out (8p, frame 17): the hook hands it the logout, the view draws the way in.
import { useEffect, useState } from "react";
import { pageLoginApi } from "../../lib/api/login.ts";
import { useApp, useAppStore } from "../../storeContext.tsx";
import { knowSession, logIn, logOut, type SessionDeps } from "./logIn.ts";
import { LoginView } from "./LoginView.tsx";

// Adena's calls come with the first click that logs in: a page that never logs in does not load them.
async function logInWithAdena(deps: SessionDeps): Promise<void> {
  const { connect, pageAdena, signLogin } = await import("../../lib/adena/adena.ts");
  await logIn(pageAdena(), { ...deps, connect, sign: signLogin });
}

/** The login's state and its two acts, the session asked as the page starts: called once, by the header's account. */
export function useLogin() {
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
  return {
    login,
    logIn: () => {
      logInWithAdena(deps).catch(reportError);
    },
    logOut: () => {
      logOut(deps).catch(reportError);
    },
  };
}

/** The way in, its step and why the last login stopped, for `login` as `useLogin` holds it. */
export function LoginControl({ login, logIn }: Pick<ReturnType<typeof useLogin>, "login" | "logIn">) {
  return <LoginView session={login.session} step={login.step} problem={login.problem} onLogIn={logIn} />;
}
