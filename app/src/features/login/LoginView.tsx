// The login's place in the header (slice 4's 4a; 8p, frame 6): one pill, Connect Adena, the step a login is at, and why the last login
// stopped. Logged in, the account's pill and its menu take the address and the way out (frame 17, AccountMenu.tsx). A phone cannot log in:
// it is told to use a computer for that, and that it writes once logged in (U6).
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
}

const STEPS = { wallet: "Opening Adena…", signing: "Sign the text in Adena…", verifying: "Checking your signature…" };

export function LoginView({ session, step, problem, onLogIn }: LoginViewProps) {
  // There from the start, empty: a screen reader announces a region's change. Alone once the session is known or awaited, so no empty box
  // holds a gap after the account's pill (frame 17's right edge).
  const status = (
    <p role="status" className={styles["problem"]}>
      {problem === undefined ? null : sayProblem(problem)}
    </p>
  );
  if (session.kind !== "out") return status;
  return (
    <Cluster>
      <span className={styles["computer"]}>
        <Button busy={step !== "idle"} onClick={onLogIn}>
          {step === "idle" ? "Connect Adena" : STEPS[step]}
        </Button>
      </span>
      <span className={styles["phone"]}>To log in, use a computer; once logged in you can write from here.</span>
      {status}
    </Cluster>
  );
}
