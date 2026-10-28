// The login's place in the header (slice 4's 4a): a way in with Adena, the step a login is at, the account
// logged in and a way out, and why the last login stopped. A phone cannot log in: it is told to use a
// computer for that, and that it writes once logged in (U6).
import { Button, Cluster } from "@gnoworld/ui";
import type { LoginSlice } from "../../store/login.ts";
import styles from "./LoginView.module.css";
import { sayProblem } from "./problem.ts";

type Login = LoginSlice["login"];
export interface LoginViewProps {
  session: Login["session"];
  step: Login["step"];
  problem: Login["problem"];
  onLogIn: () => void;
  onLogOut: () => void;
}

const STEPS = { wallet: "Opening Adena…", signing: "Sign the text in Adena…", verifying: "Checking your signature…" };
// An address's first six and last five characters: enough to know one's own.
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-5)}`;

export function LoginView({ session, step, problem, onLogIn, onLogOut }: LoginViewProps) {
  return (
    <Cluster>
      {session.kind === "in" ? (
        <>
          <span title={session.address}>{short(session.address)}</span>
          <Button size="s" emphasis="quiet" onClick={onLogOut}>
            Log out
          </Button>
        </>
      ) : null}
      {session.kind === "out" ? (
        <>
          <span className={styles["computer"]}>
            <Button size="s" busy={step !== "idle"} onClick={onLogIn}>
              {step === "idle" ? "Log in with Adena" : STEPS[step]}
            </Button>
          </span>
          <span className={styles["phone"]}>To log in, use a computer; once logged in you can write from here.</span>
        </>
      ) : null}
      {/* There from the start, empty: a screen reader announces a region's change. */}
      <p role="status" className={styles["problem"]}>
        {problem === undefined ? null : sayProblem(problem)}
      </p>
    </Cluster>
  );
}
