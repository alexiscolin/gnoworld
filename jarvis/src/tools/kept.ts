// A question's cards (ADR-0002 §4, §5; D103): what its tools kept once 10d's checks passed, bounded by kind, handed
// back with its answer. The loop makes one a question and gives each call a view of it that its own time ends, so a
// card handed in past it is never kept.
import type { AnswerButton, Digest, ProposedAction } from "@gnoworld/schemas";

/** The chain profile and the block height a card's chain sources were read at. */
export interface ReadAt {
  readonly profile: string;
  readonly height: number;
}

export interface Cards {
  readonly digests: readonly { readonly realm: string; readonly read: ReadAt; readonly digest: Digest }[];
  readonly proposals: readonly { readonly read: ReadAt; readonly action: ProposedAction }[];
  readonly buttons: readonly ({ readonly button: AnswerButton } & { readonly read?: ReadAt })[];
}

type Card =
  | { readonly kind: "digest"; readonly realm: string; readonly read: ReadAt; readonly digest: Digest }
  | { readonly kind: "proposal"; readonly read: ReadAt; readonly action: ProposedAction }
  | { readonly kind: "button"; readonly button: AnswerButton; readonly read?: ReadAt };

/** The most an answer holds of each kind. */
export const CARDS = { digests: 3, proposals: 1, buttons: 3 } as const;

export interface Kept {
  /** Keeps a card, unless its kind is full or this view's call is over. */
  keep(card: Card): boolean;
  full(kind: Card["kind"]): boolean;
  /** The cards kept so far, as new lists. */
  cards(): Cards;
  /** A view that keeps nothing once `signal` is aborted. */
  within(signal: AbortSignal): Kept;
}

/** What a call of a question is given: the question's words, its cards, and the signal its time ends. */
export interface Asked {
  readonly text: string;
  readonly cards: Kept;
  readonly signal: AbortSignal;
}

/** A question's holder of cards, empty. */
export function keepCards(): Kept {
  const digests: Cards["digests"][number][] = [];
  const proposals: Cards["proposals"][number][] = [];
  const buttons: Cards["buttons"][number][] = [];
  const counts = { digest: () => digests.length, proposal: () => proposals.length, button: () => buttons.length };
  const caps = { digest: CARDS.digests, proposal: CARDS.proposals, button: CARDS.buttons };
  const full = (kind: Card["kind"]) => counts[kind]() >= caps[kind];
  const keep = (card: Card): boolean => {
    if (full(card.kind)) return false;
    if (card.kind === "digest") digests.push({ realm: card.realm, read: card.read, digest: card.digest });
    else if (card.kind === "proposal") proposals.push({ read: card.read, action: card.action });
    else buttons.push(card.read === undefined ? { button: card.button } : { button: card.button, read: card.read });
    return true;
  };
  const cards = (): Cards => ({ digests: [...digests], proposals: [...proposals], buttons: [...buttons] });
  const view = (signal?: AbortSignal): Kept => ({
    keep: (card) => signal?.aborted !== true && keep(card),
    full,
    cards,
    within: (inner) => view(signal === undefined ? inner : AbortSignal.any([signal, inner])),
  });
  return view();
}
