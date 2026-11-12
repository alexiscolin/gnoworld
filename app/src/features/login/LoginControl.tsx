// The login in the page: the session read as the page starts, again until the server says (paused while the tab is hidden, resting
// after a round), a login with the page's Adena, a logout. The header's account menu holds the way out (8p, frame 17): the hook hands it
// the logout, the view draws the way in.
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { pageLoginApi } from "../../lib/api/login.ts";
import { useApp, useAppStore } from "../../storeContext.tsx";
import { GET_STARTED } from "./getStartedAsk.ts";
import { knowSession, logIn, logOut, pageClock, type SessionDeps } from "./logIn.ts";
import { LoginView } from "./LoginView.tsx";

// What a login with no Adena opens (D13017), after the first screen.
const GetStarted = lazy(async () => ({ default: (await import("./GetStarted.tsx")).GetStarted }));

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

/** The login's state and its two acts, the session asked as the page starts: called once, by the header's account. */
export function useLogin() {
  const store = useAppStore();
  const [deps] = useState<SessionDeps>(() => ({ api: pageLoginApi(), store }));
  const login = useApp((state) => state.login);
  const wallet = useApp((state) => state.wallet);
  useEffect(() => {
    if (wallet !== undefined) follow(deps, wallet).catch(reportError);
  }, [deps, wallet]);
  useEffect(() => {
    // The page's clock, which the page's leaving stops: the session is then asked no more.
    const clock = pageClock(document);
    knowSession(deps, clock.wait, clock.rest).catch(reportError);
    return clock.stop;
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

/** The way in, its step and why the last login stopped, for `login` as `useLogin` holds it; `network`, the network's name the button
 * carries after its words (D340). */
export function LoginControl({
  login,
  logIn,
  network = null,
}: Pick<ReturnType<typeof useLogin>, "login" | "logIn"> & { network?: ReactNode }) {
  // A login that found no Adena opens the steps; the button, still "Install Adena", opens them again once closed.
  const missing = login.problem?.reason === "missing";
  const [open, setOpen] = useState(false);
  const [was, setWas] = useState(false);
  // Drawn from the first ask on and kept, so that its closing fades as its opening does.
  const [drawn, setDrawn] = useState(false);
  // The welcome card's "Get started" (getStartedAsk.ts) opens the same dialog.
  useEffect(() => {
    const ask = () => {
      setOpen(true);
      setDrawn(true);
    };
    window.addEventListener(GET_STARTED, ask);
    return () => {
      window.removeEventListener(GET_STARTED, ask);
    };
  }, []);
  if (missing !== was) {
    setWas(missing);
    if (missing) {
      setOpen(true);
      setDrawn(true);
    }
  }
  return (
    <>
      <LoginView
        session={login.session}
        step={login.step}
        problem={login.problem}
        onLogIn={
          missing
            ? () => {
                setOpen(true);
              }
            : logIn
        }
        network={network}
      />
      {drawn ? (
        <Suspense fallback={null}>
          <GetStarted
            open={open}
            onClose={() => {
              setOpen(false);
            }}
            onConnect={() => {
              setOpen(false);
              logIn();
            }}
          />
        </Suspense>
      ) : null}
    </>
  );
}
