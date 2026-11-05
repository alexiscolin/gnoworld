// The call cards' slice of the store (9d): one card is one call being prepared, signed by Adena and followed to its block. Its
// state moves only along the course, preview, signing, landing, done, so nothing is done before the chain has answered
// (ADR-0002 section 4). It is added to the page's store by the first realm view that draws a card (features/calls/slice.ts), and
// its code lives outside store/, whose files vite.config.ts puts in the first screen's chunk: only its types are here.
import type { Param } from "@gnoworld/core";
import type { CallFailure } from "./adena/answers.ts";

/** Why a card failed: Adena's reasons, and the four of the card's own. */
export type CardFailure = CallFailure | "logged-out" | "unseen" | "chain" | "not-loaded";

export type CardState =
  | { kind: "preview" }
  | { kind: "signing" }
  | { kind: "landing"; hash: string; adena?: string | undefined }
  | { kind: "done"; hash: string; height: number; value: string }
  | {
      kind: "failed";
      reason: CardFailure;
      log?: string | undefined;
      hash?: string | undefined;
      /** What Adena reported for a call it named a hash for and said failed. */
      adena?: string | undefined;
    };

export interface CallCard {
  /** One card a row of a chain: the chain and the function's name. */
  id: string;
  /** The chain the card was opened for: a card signs only on it. */
  chainId: string;
  realm: string;
  func: string;
  params: readonly Param[];
  /** The text of each field, the realm parameter left out. */
  texts: readonly string[];
  state: CardState;
}

interface NewCard {
  id: string;
  chainId: string;
  realm: string;
  func: string;
  params: readonly Param[];
}

export interface CallsSlice {
  calls: Readonly<Record<string, CallCard>>;
  callsActions: {
    open: (card: NewCard) => void;
    edit: (id: string, index: number, text: string) => void;
    signing: (id: string) => void;
    landing: (id: string, hash: string, adena?: string) => void;
    done: (id: string, result: { height: number; value: string }) => void;
    failed: (
      id: string,
      failure: { reason: CardFailure; log?: string | undefined; hash?: string | undefined; adena?: string | undefined },
    ) => void;
    retry: (id: string) => void;
    close: (id: string) => void;
  };
}
