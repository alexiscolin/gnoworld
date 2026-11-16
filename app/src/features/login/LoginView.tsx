// The login's place in the header: one pill, Connect Adena, the step a login is at, and why the last login stopped. Logged in, the
// account's pill and its menu take the address and the way out (AccountMenu.tsx). A phone cannot log in: it is told to use a computer
// for that, and that it writes once logged in.
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
  /** The network's name, after the button in its pill, and after the phone's words. */
  network?: ReactNode;
}

const STEPS = { wallet: "Opening Adena…", signing: "Sign the text in Adena…", verifying: "Checking your signature…" };

// The button's words: the step a login is at, or, once it stopped, the short why.
const wordsOf = (step: Login["step"], stopped: string | undefined) =>
  stopped ?? (step === "idle" ? "Connect Adena" : STEPS[step]);

export function LoginView({ session, step, problem, onLogIn, network = null }: LoginViewProps) {
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
  return (
    <Cluster>
      <span className={styles["computer"]}>
        <span className="pill-group">
          <Button busy={step !== "idle"} onClick={onLogIn} {...(stopped ? { description: sayProblem(problem) } : {})}>
            {stopped ? <Icon name="alert" /> : null}
            {wordsOf(step, stopped ? sayShort(problem) : undefined)}
          </Button>
          {/* Beside the button, never in it: a control in a control would press the login with it. */}
          {network}
        </span>
      </span>
      <span className={styles["phone"]}>
        <span className={styles["words"]}>Log in on a computer; then write from here.</span>
        {network}
      </span>
      {status}
    </Cluster>
  );
}
