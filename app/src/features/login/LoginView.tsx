// The login's place in the header (slice 4's 4a): a way in with Adena, the step a login is at, the account
// logged in and a way out, and why the last login stopped. A phone cannot log in: it is told to use a
// computer for that, and that it writes once logged in (U6).
import { Button, Cluster } from "@gnoworld/ui";
import { lazy, Suspense } from "react";
import { shortAddress } from "../../lib/shortAddress.ts";
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
  /** The id of the universe the page is in: the chain a name is registered on. */
  universe?: string | undefined;
}

// The account's name is read after the first screen: its own chunk, the short address standing in until it is there.
const AccountName = lazy(() => import("../names/index.ts"));

const STEPS = { wallet: "Opening Adena…", signing: "Sign the text in Adena…", verifying: "Checking your signature…" };

export function LoginView({ session, step, problem, onLogIn, onLogOut, universe }: LoginViewProps) {
  return (
    <Cluster>
      {session.kind === "in" ? (
        <>
          <Suspense
            fallback={
              <span className={styles["account"]} title={session.address}>
                {shortAddress(session.address)}
              </span>
            }
          >
            <AccountName account={session.address} universe={universe} pill={styles["account"] ?? ""} />
          </Suspense>
          <Button size="s" emphasis="quiet" onClick={onLogOut}>
            Log out
          </Button>
        </>
      ) : null}
      {session.kind === "out" ? (
        <>
          <span className={styles["computer"]}>
            <Button busy={step !== "idle"} onClick={onLogIn}>
              {step === "idle" ? "Connect Adena" : STEPS[step]}
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
