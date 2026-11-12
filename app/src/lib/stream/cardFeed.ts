// The page's feed of the link cards (link-previews L4), a chunk of its own that a page loads when the stream first tells a card (the first
// screen holds none of the cards' schemas): each event through its schema, one that fails dropped and said once, then into the store.
import { CardEvent } from "@gnoworld/schemas";
import { eventFeed } from "./eventFeed.ts";

/** The data of a `card` event, as the stream gave it. */
export const cardFeed = eventFeed(CardEvent, "card_unknown");
