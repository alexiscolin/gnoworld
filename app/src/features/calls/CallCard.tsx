// The call card (9d, ADR-0002 section 4): a call to a realm shown before Adena opens, in the thread under its function's row and
// never as a modal. The kicker, the title, the block of what is called and where, the warnings, then the signature and its
// way out; once signed, the wait, the landing in a block and the result. Every state is words with its next step, and the
// result says done only from the chain's answer, which the course puts in the card (signCall.ts).
import { callFields } from "@gnoworld/core";
import { Button, Card, Field, Sidebar, Stack } from "@gnoworld/ui";
import type { ReactNode } from "react";
import type { CallCard as Card_ } from "../../lib/calls.ts";
import styles from "./CallCard.module.css";
import { problemsOf } from "./problems.ts";
import { sayFailure, sayProblem, shown } from "./say.ts";

export interface CallCardProps {
  card: Card_;
  /** The universe's chain: what the call is signed for. */
  network: { name: string; chainId: string };
  /** The fee line, already worded as an estimate (fee.ts). */
  fee: string;
  onEdit: (index: number, text: string) => void;
  onSign: () => void;
  onCancel: () => void;
  onRetry: () => void;
}

const COUNT = new Intl.NumberFormat("en-US");

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Sidebar space="xs">
      <span className="label">{label}</span>
      <span className={styles["value"]}>{children}</span>
    </Sidebar>
  );
}

// A transaction's hash, short, whole in its title.
const Tx = ({ hash }: { hash: string }) => <span title={hash}>tx {hash.slice(0, 6)}…</span>;

// The result of the call as the card says it: the state's words in the one status region, and what the chain gave.
function Status({ card }: { card: Card_ }) {
  const { state } = card;
  if (state.kind === "signing") return <p role="status">Waiting for your signature in Adena…</p>;
  if (state.kind === "landing") {
    return (
      <p role="status">
        Landing in a block… <Tx hash={state.hash} />
      </p>
    );
  }
  if (state.kind === "done") {
    return (
      <Stack space="2xs">
        <p role="status">
          <span title={state.hash}>Signed · tx {state.hash.slice(0, 6)}…</span>, in block {COUNT.format(state.height)}.
        </p>
        {state.value === "" ? null : <p className={styles["value"]}>Returned {shown(state.value)}</p>}
      </Stack>
    );
  }
  if (state.kind === "failed") {
    return (
      <Stack space="2xs">
        <p role="status">{sayFailure(state)}</p>
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

// What is called with: the fields to fill in preview, the texts as they were once the card has left it.
function Arguments({ card, onEdit }: Pick<CallCardProps, "card" | "onEdit">) {
  const fields = callFields(card.params);
  const list = fields.ok ? fields.fields : [];
  // A field is its place: the list never reorders.
  const rows = list.map((field, index) => ({ field, name: field.name, index }));
  const problems = problemsOf(card);
  if (card.state.kind !== "preview") {
    return list.length === 0 ? (
      "none"
    ) : (
      <Stack space="3xs">
        {rows.map(({ name, index }) => (
          <span key={index}>
            {name}: {shown(card.texts[index] ?? "")}
          </span>
        ))}
      </Stack>
    );
  }
  return (
    <Stack space="xs">
      {rows.map(({ field, index }) => {
        const text = card.texts[index] ?? "";
        const problem = problems[index];
        return (
          <Field
            key={index}
            label={field.name === "" ? `Argument ${String(index + 1)}` : field.name}
            value={text}
            onChange={(next) => {
              onEdit(index, next);
            }}
            {...(field.freeText ? { help: `This text goes to ${card.realm} on gno.land, publicly and forever.` } : {})}
            {...(problem !== undefined && text !== "" ? { error: sayProblem(problem) } : {})}
          />
        );
      })}
    </Stack>
  );
}

function Actions({ card, onSign, onCancel, onRetry }: Omit<CallCardProps, "network" | "fee" | "onEdit">) {
  const { state } = card;
  if (state.kind === "preview") {
    const stuck = problemsOf(card).some((problem) => problem !== undefined);
    return (
      <Card.Actions>
        <span className={styles["computer"]}>
          <Button emphasis="solid" disabled={stuck} onClick={onSign}>
            Sign in Adena
          </Button>
        </span>
        <Button onClick={onCancel}>Cancel</Button>
      </Card.Actions>
    );
  }
  if (state.kind === "failed" && state.hash === undefined) {
    return (
      <Card.Actions>
        <Button emphasis="solid" onClick={onRetry}>
          Try again
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </Card.Actions>
    );
  }
  if (state.kind === "done" || state.kind === "failed") {
    return (
      <Card.Actions>
        <Button onClick={onCancel}>Close</Button>
      </Card.Actions>
    );
  }
  return null;
}

export function CallCard({ card, network, fee, onEdit, onSign, onCancel, onRetry }: CallCardProps) {
  const preview = card.state.kind === "preview";
  return (
    <Card>
      <Card.Header kicker="SIGNATURE REQUEST · ADENA" title={card.func} size="large" />
      <Card.Body>
        <p>A call to {card.realm}. Adena asks you to sign it.</p>
        <div className={styles["block"]}>
          <Stack space="xs">
            <Row label="REALM">{card.realm}</Row>
            <Row label="FUNCTION">{card.func}</Row>
            <Row label="ARGUMENTS">
              <Arguments card={card} onEdit={onEdit} />
            </Row>
            <Row label="NETWORK">{`${network.name} (${network.chainId})`}</Row>
            <Row label="FEE">{fee}</Row>
          </Stack>
        </div>
        {preview ? <p>gnoworld does not check what this realm does. Read it on gnoweb first.</p> : null}
        <Status card={card} />
        {preview ? <p className={styles["phone"]}>To sign, use a computer.</p> : null}
      </Card.Body>
      <Actions card={card} onSign={onSign} onCancel={onCancel} onRetry={onRetry} />
    </Card>
  );
}
