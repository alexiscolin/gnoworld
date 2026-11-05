// The name dialog (9f, frames 9 to 15, "Pick a name and a face"): the kicker, the title, the line naming r/sys/namereg, the person's
// nebula as the face (no planet, no upload: ADR-0002 section 1), the `nym-` field with its rule, "Register · 0 GNOT" and "Later".
// It holds no state of the chain: its `phase` is the card's course, and a name shows as registered only in the phase `done`.
import { Avatar, Button, Cluster, Dialog, Field, Kicker, Stack } from "@gnoworld/ui";
import { useState, type SyntheticEvent } from "react";
import styles from "./NameDialog.module.css";
import { nymProblem, NYM_RULE } from "./nym.ts";
import type { Phase } from "./phase.ts";

export interface NameDialogProps {
  open: boolean;
  account: string;
  /** The universe's chain: where the name is registered; `real` when its GNOT is real money. */
  network: { name: string; chainId: string; real: boolean };
  phase: Phase;
  onRegister: (typed: string) => void;
  onClose: () => void;
}

const COUNT = new Intl.NumberFormat("en-US");

// What the network costs, in words: the registry's price is 0, Adena's network fee is not.
const feeWords = ({ name, real }: NameDialogProps["network"]) =>
  real
    ? "The registry's price is 0 GNOT. Adena asks for the network fee in real GNOT when you sign."
    : `${name} is a test network: the network fee Adena asks for is paid in test GNOT, which has no value.`;

function State({ phase }: { phase: Phase }) {
  return (
    <p role="status" className={styles["state"]}>
      {phase.kind === "working" || phase.kind === "failed" ? phase.text : null}
      {phase.kind === "done" ? `${phase.name} is registered, in block ${COUNT.format(phase.height)}.` : null}
    </p>
  );
}

export function NameDialog({ open, account, network, phase, onRegister, onClose }: NameDialogProps) {
  // What is typed stays through a wait and a failure that leaves the form: the person corrects it, never retypes it.
  const [typed, setTyped] = useState("");
  const [asked, setAsked] = useState(false);
  const problem = nymProblem(typed);
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    setAsked(true);
    if (problem === undefined) onRegister(typed);
  };
  const form = phase.kind === "typing" || (phase.kind === "failed" && phase.again);
  return (
    <Dialog
      title="Pick a name and a face"
      open={open}
      onClose={onClose}
      description="Your name is kept by r/sys/namereg on this universe's chain."
    >
      <Stack space="s">
        <Cluster>
          <Avatar address={account} name="You" size="l" />
          <Kicker>YOUR GNO.LAND NAME</Kicker>
        </Cluster>
        {form ? (
          <form onSubmit={submit}>
            <Stack space="s">
              <Field
                label="Name"
                prefix="nym-"
                value={typed}
                onChange={setTyped}
                help={NYM_RULE}
                {...(asked && problem !== undefined ? { error: problem } : {})}
              />
              <p className={styles["note"]}>{feeWords(network)}</p>
              <span className={styles["computer"]}>
                <Button emphasis="solid" type="submit">
                  Register · 0 GNOT
                </Button>
              </span>
              <p className={[styles["phone"], styles["note"]].join(" ")}>To sign, use a computer.</p>
            </Stack>
          </form>
        ) : null}
        <State phase={phase} />
        <Cluster>
          <Button onClick={onClose}>Later</Button>
        </Cluster>
      </Stack>
    </Dialog>
  );
}
