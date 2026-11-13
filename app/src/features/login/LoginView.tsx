// The login's place in the header (slice 4's 4a; 8p, frame 6): one pill, Connect Adena, the step a login is at, and why the last login
// stopped. Logged in, the account's pill and its menu take the address and the way out (frame 17, AccountMenu.tsx). A phone cannot log in:
// it is told to use a computer for that, and that it writes once logged in (U6).
import { Button, Cluster, Icon } from "@gnoworld/ui";
import type { ReactNode } from "react";
import type { LoginSlice } from "../../store/login.ts";
import styles from "./LoginView.module.css";
import { sayProblem, sayShort } from "./problem.ts";

type Login = LoginSlice["login"];
export interface LoginViewProps {
  session: Login["session"];
  step: Login["step"];
  problem: Login["problem"];
  onLogIn: () => void;
  /** The network's name, after the button's words, and after the phone's (D340). */
  network?: ReactNode;
}

const STEPS = { wallet: "Opening Adena…", signing: "Sign the text in Adena…", verifying: "Checking your signature…" };

// The button's words: the step a login is at, or, once it stopped, the short why.
const wordsOf = (step: Login["step"], stopped: string | undefined) =>
  stopped ?? (step === "idle" ? "Connect Adena" : STEPS[step]);

export function LoginView({ session, step, problem, onLogIn, network = null }: LoginViewProps) {
  // There from the start, empty: a screen reader announces a region's change. Alone once the session is known or awaited, so no empty box
  // holds a gap after the account's pill (frame 17's right edge).
  const status = (
    <p role="status" className={session.kind === "out" ? "visually-hidden" : styles["problem"]}>
      {problem === undefined ? null : sayProblem(problem)}
    </p>
  );
  if (session.kind !== "out") return status;
  // Why the last login stopped is the button's own words (D377), short; its status region says it whole to a screen reader alone.
  const stopped = step === "idle" && problem !== undefined;
  return (
    <Cluster>
      <span className={styles["computer"]}>
        <Button busy={step !== "idle"} onClick={onLogIn} {...(stopped ? { description: sayProblem(problem) } : {})}>
          {stopped ? <Icon name="alert" /> : null}
          {wordsOf(step, stopped ? sayShort(problem) : undefined)}
          {network}
        </Button>
      </span>
      <span className={styles["phone"]}>
        To log in, use a computer; once logged in you can write from here.
        {network}
      </span>
      {status}
    </Cluster>
  );
}
