// The call card (9d, ADR-0002 section 4): a call to a realm shown before Adena opens, in the thread under its function's row and
// never as a modal. The kicker, the title, the block of what is called and where, the warnings, then the signature and its
// way out; once signed, the wait, the landing in a block and the result. Every state is words with its next step, and the
// result says done only from the chain's answer, which the course puts in the card (signCall.ts).
import { callFields } from "@gnoworld/core";
import { Button, Card, Field, Stack } from "@gnoworld/ui";
import type { ReactNode } from "react";
import type { CallCard as Card_ } from "../../lib/calls.ts";
import shared from "../../edge.module.css";
import styles from "./CallCard.module.css";
import { CallStatus } from "./CallStatus.tsx";
import { problemsOf } from "./problems.ts";
import { networkOf, publicForever, sayProblem, shown, warningsOf } from "./say.ts";
import { retryable } from "./slice.ts";

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
  /** The title's level under the page's headings: 3 unless the page says. */
  level?: 2 | 3 | 4 | undefined;
  /** The call's name, its title when it has one (a pinned action's label); else its function. */
  title?: string | undefined;
  /** The login the signature needs: logged out, the card's first button is the login itself. Left out, the account is taken as in. */
  login?: { signedIn: boolean; onLogIn: () => void } | undefined;
}

/** A fact of a card: its label, then its value (a pair of a definition list). */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="label">{label}</dt>
      <dd className={["fact-value", styles["value"]].join(" ")}>{children}</dd>
    </>
  );
}

// What is called with: the fields to fill in preview (a name in its own case, as the frames draw it; the field's label is for
// assistive technology), the texts as they were once the card has left it.
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
        const name = field.name === "" ? `Argument ${String(index + 1)}` : field.name;
        return (
          <Stack key={index} space="2xs">
            <span aria-hidden="true" className={styles["name"]}>
              {name}
            </span>
            <Field
              hideLabel
              label={name}
              value={text}
              onChange={(next) => {
                onEdit(index, next);
              }}
              {...(field.freeText ? { help: publicForever(card.realm) } : {})}
              {...(problem !== undefined && text !== "" ? { error: sayProblem(problem) } : {})}
            />
          </Stack>
        );
      })}
    </Stack>
  );
}

function Actions({ card, onSign, onCancel, onRetry, login }: Omit<CallCardProps, "network" | "fee" | "onEdit">) {
  const { state } = card;
  const out = login !== undefined && !login.signedIn;
  // A failure the login caused is mended by the login: the card goes back to its preview once Adena is connected.
  if (out && (state.kind === "preview" || (state.kind === "failed" && state.reason === "logged-out"))) {
    return (
      <Card.Actions>
        <Button
          emphasis="solid"
          onClick={() => {
            if (state.kind === "failed") onRetry();
            login.onLogIn();
          }}
        >
          Connect Adena
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </Card.Actions>
    );
  }
  if (state.kind === "preview") {
    const stuck = problemsOf(card).some((problem) => problem !== undefined);
    return (
      <Card.Actions>
        <span className="fine-only">
          <Button emphasis="solid" disabled={stuck} onClick={onSign}>
            Sign in Adena
          </Button>
        </span>
        <Button onClick={onCancel}>Cancel</Button>
      </Card.Actions>
    );
  }
  // A call that may have been sent has no way back to a signature: it could be signed twice (F5728, F5747).
  if (retryable(state)) {
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
  // Signing and landing keep the signature button where it was, pressed; the call cannot be withdrawn.
  return (
    <Card.Actions>
      <Button emphasis="solid" busy>
        Sign in Adena
      </Button>
    </Card.Actions>
  );
}

export function CallCard({
  card,
  network,
  fee,
  onEdit,
  onSign,
  onCancel,
  onRetry,
  level,
  title,
  login,
}: CallCardProps) {
  const preview = card.state.kind === "preview";
  return (
    <Card>
      <Card.Header
        kicker="SIGNATURE REQUEST · ADENA"
        title={title ?? card.func}
        size="large"
        {...(level === undefined ? {} : { level })}
      />
      <Card.Body>
        <p className={styles["lede"]}>A call to {card.realm}. Adena asks you to sign it.</p>
        <dl className={[shared["edge"], styles["block"]].join(" ")}>
          <Fact label="REALM">{card.realm}</Fact>
          <Fact label="FUNCTION">{card.func}</Fact>
          <Fact label="ARGUMENTS">
            <Arguments card={card} onEdit={onEdit} />
          </Fact>
          <Fact label="NETWORK">{networkOf(network)}</Fact>
          <Fact label="FEE">{fee}</Fact>
        </dl>
        {preview
          ? warningsOf(card).map((warning) => (
              <p key={warning} className="meta">
                {warning}
              </p>
            ))
          : null}
        <CallStatus card={card} />
        {preview ? <p className="meta coarse-only">To sign, use a computer.</p> : null}
      </Card.Body>
      <Actions card={card} onSign={onSign} onCancel={onCancel} onRetry={onRetry} login={login} />
    </Card>
  );
}
