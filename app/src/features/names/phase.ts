// What the dialog says of the registration's course: the card's state in the dialog's words. Nothing is registered here but in the
// state `done`, which the card reaches only from the chain's answer.
import type { CallCard } from "../../lib/calls.ts";
import { retryable, sayFailure } from "../calls/index.ts";

export type Phase =
  | { kind: "typing" }
  | { kind: "working"; text: string }
  | { kind: "done"; name: string; height: number }
  | { kind: "failed"; text: string; again: boolean };

const WORKING = { signing: "Waiting for your signature in Adena…", landing: "Landing in a block…" } as const;

/** The phase of a registration card, or the empty form for none. */
export function phaseOf(card: Pick<CallCard, "state" | "texts"> | undefined): Phase {
  if (card === undefined || card.state.kind === "preview") return { kind: "typing" };
  const { state } = card;
  if (state.kind === "done") return { kind: "done", name: card.texts[0] ?? "", height: state.height };
  if (state.kind !== "failed") return { kind: "working", text: WORKING[state.kind] };
  // A call that may have been sent has no way back to a second signature (9d-2); one the chain ran and refused changed nothing.
  const again = state.reason === "chain" || retryable(state);
  return { kind: "failed", text: sayFailure(state), again };
}
