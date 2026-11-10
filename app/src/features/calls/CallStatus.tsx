// The call card's status line (CallCard.tsx): the wait for the signature, the landing in a block, the result or the failure.
import { Stack } from "@gnoworld/ui";
import type { CallCard as Card_ } from "../../lib/calls.ts";
import appear from "../../enter.module.css";
import styles from "./CallCard.module.css";
import { sayFailure, shown } from "./say.ts";

const COUNT = new Intl.NumberFormat("en-US");

// The mark before a wait's words, a ring turning, and before the result's, a dot: drawn by the stylesheet.
const Mark = ({ kind }: { kind: "ring" | "dot" }) => (
  <span className={styles["mark"]} data-mark={kind} aria-hidden="true" />
);

// A transaction's hash, short as the frame draws it (its first and last four), whole in its title.
const Tx = ({ hash }: { hash: string }) => (
  <span title={hash}>
    tx {hash.slice(0, 4)}…{hash.slice(-4)}
  </span>
);

// The result of the call as the card says it: the state's words in the one status region, and what the chain gave.
export function CallStatus({ card }: { card: Card_ }) {
  const { state } = card;
  if (state.kind === "signing") {
    return (
      <p role="status" className={[styles["line"], appear["enter"]].join(" ")}>
        <Mark kind="ring" />
        <span>Waiting for your signature in Adena…</span>
      </p>
    );
  }
  if (state.kind === "landing") {
    return (
      <p role="status" className={[styles["line"], appear["enter"]].join(" ")}>
        <Mark kind="ring" />
        <span>
          Landing in a block… <Tx hash={state.hash} />
          {state.adena === undefined || state.adena === "" ? null : ` Adena reported: ${shown(state.adena)}`}
        </span>
      </p>
    );
  }
  if (state.kind === "done") {
    return (
      <Stack space="2xs">
        <p role="status" className={[styles["line"], appear["enter"]].join(" ")}>
          <Mark kind="dot" />
          <span>
            Signed · <Tx hash={state.hash} />, in block {COUNT.format(state.height)}.
          </span>
        </p>
        {state.value === "" ? null : (
          <p className={[styles["value"], appear["enter"]].join(" ")}>Returned {shown(state.value)}</p>
        )}
      </Stack>
    );
  }
  if (state.kind === "failed") {
    return (
      <Stack space="2xs">
        <p role="status" className={appear["enter"]}>
          {sayFailure(state)}
        </p>
        {state.hash === undefined || state.reason === "unseen" ? null : (
          <p>
            <Tx hash={state.hash} />
          </p>
        )}
      </Stack>
    );
  }
  return <p role="status" className={styles["status"]} />;
}
