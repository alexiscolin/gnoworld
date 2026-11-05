// The call cards' slice of the store (9d): one card is one call being prepared, signed by Adena and followed to its block. Its
// state moves only along the course, preview, signing, landing, done, so nothing is done before the chain has answered
// (ADR-0002 section 4). It is added to the page's store by the first realm view that draws a card (features/calls/slice.ts), and
// its code lives outside store/, whose files vite.config.ts puts in the first screen's chunk: only its types are here.
import type { CallFailure } from "./adena/answers.ts";

/** Why a card failed: Adena's reasons, and the three of the card's own. */
export type CardFailure = CallFailure | "logged-out" | "unseen" | "chain";
