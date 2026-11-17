// The login's place in the header: one pill, Connect, the step a login is at, and why the last login stopped; pressed, Connect opens
// its menu of two ways in, Adena and the command line (D13881). Logged in, the account's pill and its menu take the address and the way
// out (AccountMenu.tsx). A phone cannot log in: it is told to use a computer for that, and that it writes once logged in.
import { Button, Cluster, Icon } from "@gnoworld/ui";
import { lazy, Suspense, useState, type ReactNode } from "react";
import type { LoginSlice } from "../../store/login.ts";
import styles from "./LoginView.module.css";
import { sayProblem, sayShort } from "./problem.ts";

type Login = LoginSlice["login"];
export interface LoginViewProps {
  session: Login["session"];
  step: Login["step"];
  problem: Login["problem"];
  /** Adena's way in. */
  onLogIn: () => void;
  /** The command line's way in (D13881). */
  onKey: () => void;
  /** The network's name, after the button in its pill, and after the phone's words. */
  network?: ReactNode;
}

// The menu's code comes with Connect's first press, as the device's menu's does (AccountMenu.tsx).
const ConnectMenu = lazy(async () => ({ default: (await import("./ConnectMenu.tsx")).ConnectMenu }));

const STEPS = { wallet: "Opening Adena…", signing: "Sign the text in Adena…", verifying: "Checking your signature…" };

// The button's words: the step a login is at, or, once it stopped, the short why.
const wordsOf = (step: Login["step"], stopped: string | undefined) =>
  stopped ?? (step === "idle" ? "Connect" : STEPS[step]);

export function LoginView({ session, step, problem, onLogIn, onKey, network = null }: LoginViewProps) {
  const [asked, setAsked] = useState(false);
  // There from the start, empty: a screen reader announces a region's change. Alone once the session is known or awaited, so no empty box
  // holds a gap after the account's pill.
  const status = (
    <p role="status" className={session.kind === "out" ? "visually-hidden" : styles["problem"]}>
      {problem === undefined ? null : sayProblem(problem)}
    </p>
  );
  // Logged in, the account's pill names the network (AccountMenu.tsx); before the session is known, the header's own row does.
  if (session.kind !== "out") return status;
  // Why the last login stopped is the button's own words, short; its status region says it whole to a screen reader alone.
  const stopped = step === "idle" && problem !== undefined;
  const words = wordsOf(step, stopped ? sayShort(problem) : undefined);
  const lead = stopped ? <Icon name="alert" /> : null;
  // Connect as the menu draws it, until the menu's code takes its place, open.
  const trigger = (
    <Button
      busy={step !== "idle"}
      onClick={() => {
        setAsked(true);
      }}
      {...(stopped ? { description: sayProblem(problem) } : {})}
    >
      {lead}
      {words}
    </Button>
  );
  return (
    <Cluster>
      <span className={styles["computer"]}>
        <span className="pill-group">
          {asked ? (
            <Suspense fallback={trigger}>
              <ConnectMenu words={words} lead={lead} busy={step !== "idle"} onAdena={onLogIn} onKey={onKey} />
            </Suspense>
          ) : (
            trigger
          )}
          {/* Beside the button, never in it: a control in a control would press the login with it. */}
          {network}
        </span>
      </span>
      <span className={styles["phone"]}>
        To log in, use a computer; once logged in you can write from here.
        {network}
      </span>
      {status}
    </Cluster>
  );
}
