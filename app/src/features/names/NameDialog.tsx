// The name dialog (9f, frames 9 to 15, "Pick a name and a face"): the kicker, the title, the line naming r/sys/namereg, the person's
// nebula as the face (no planet, no upload: ADR-0002 section 1), the `nym-` field with its rule, "Register · 0 GNOT" and "Later".
// It holds no state of the chain: its `phase` is the card's course, and a name shows as registered only in the phase `done`.
import { Avatar, Button, Cluster, Dialog, Field, grouped, Stack } from "@gnoworld/ui";
import { useState, type SyntheticEvent } from "react";
import { NOT_CHECKED, networkOf, publicForever } from "../calls/index.ts";
import appear from "../../enter.module.css";
import styles from "./NameDialog.module.css";
import { NAMEREG, NYM_PREFIX, nymProblem, NYM_RULE } from "./nym.ts";
import type { Phase } from "./phase.ts";

export interface NameDialogProps {
  open: boolean;
  account: string;
  /** The universe's chain: where the name is registered; `real` when its GNOT is real money. */
  network: { name: string; chainId: string; real: boolean };
  /** The fee line, already worded as an estimate (the call card's feeText). */
  fee: string;
  phase: Phase;
  onRegister: (typed: string) => void;
  onClose: () => void;
}

// What the network costs, in words: the registry's price is 0, the network fee is not.
const feeWords = ({ name, real }: NameDialogProps["network"], fee: string) =>
  real
    ? `The registry's price is 0 GNOT. The network fee is paid in real GNOT. Fee: ${fee}.`
    : `${name} is a test network: its GNOT has no value. The registry's price is 0 GNOT. Fee: ${fee}.`;

function State({ phase }: { phase: Phase }) {
  return (
    <p role="status" className={styles["state"]}>
      <span key={phase.kind} className={appear["enter"]}>
        {phase.kind === "working" || phase.kind === "failed" ? phase.text : null}
        {phase.kind === "done" ? `${phase.name} is registered, in block ${grouped(phase.height)}.` : null}
      </span>
    </p>
  );
}

export function NameDialog({ open, account, network, fee, phase, onRegister, onClose }: NameDialogProps) {
  // What is typed stays through a wait and a failure that leaves the form: the person corrects it, never retypes it.
  const [typed, setTyped] = useState("");
  const problem = nymProblem(typed);
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (problem === undefined) onRegister(typed);
  };
  const form = phase.kind === "typing" || (phase.kind === "failed" && phase.again);
  return (
    <Dialog title="Pick a name and a face" kicker="YOUR GNO.LAND NAME" hideClose open={open} onClose={onClose}>
      <Stack space="s">
        <p className={styles["note"]} data-size="reading">
          Your name is kept by <code>r/sys/namereg</code> on {networkOf(network)}.
        </p>
        <Avatar address={account} name="You" size="l" />
        <form onSubmit={submit}>
          <Stack space="s">
            {form ? (
              <Field
                label="Name"
                prefix={NYM_PREFIX}
                placeholder="alexis042"
                value={typed}
                onChange={setTyped}
                help={NYM_RULE}
                {...(typed !== "" && problem !== undefined ? { error: problem } : {})}
              />
            ) : null}
            <Cluster>
              {form ? (
                <span className={styles["computer"]}>
                  <Button emphasis="solid" type="submit" disabled={problem !== undefined}>
                    Register · 0 GNOT
                  </Button>
                </span>
              ) : null}
              <Button onClick={onClose}>{phase.kind === "done" ? "Done" : "Later"}</Button>
            </Cluster>
            <State phase={phase} />
            <p className={styles["note"]}>{feeWords(network, fee)}</p>
            <p className={[styles["phone"], styles["note"]].join(" ")}>To sign, use a computer.</p>
            <p className={styles["note"]}>
              {publicForever(NAMEREG)} {NOT_CHECKED}
            </p>
          </Stack>
        </form>
      </Stack>
    </Dialog>
  );
}
