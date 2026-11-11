// The cards' slice as a page reads it (link-previews L4): none before a card came. Apart from cardsSlice.ts, whose code joins the page's store
// with the first card; this holds no more than the type and the test.
import type { CardEvent } from "@gnoworld/schemas";
import type { AppState } from "../../store/index.ts";

export interface CardsSlice {
  /** Each room's card keys, by msgid. */
  cards: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Each room's msgids with a card, oldest first: an object puts a key of digits before the others. */
  cardsOrder: Readonly<Record<string, readonly string[]>>;
  cardActions: {
    /** Events from the stream, in order: a key sets a line's card, no key takes it away for good. */
    told: (events: readonly CardEvent[]) => void;
    /** The server's answer for lines older than the stream: fills a line neither told nor removed. */
    asked: (events: readonly CardEvent[]) => void;
    /** A new session: no card of the last one's rooms stays. */
    forget: () => void;
  };
}

/** The state with the cards' slice, or none before a card was told. */
export const cardsIn = (state: AppState): (AppState & CardsSlice) | undefined =>
  "cardActions" in state ? (state as AppState & CardsSlice) : undefined;
