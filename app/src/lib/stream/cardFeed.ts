// The page's feed of the link cards (link-previews L4), a chunk of its own that a page loads when the stream first tells a card (the first
// screen holds none of the cards' schemas): each event through its schema, one that fails dropped and said once, then into the store.
import { CardEvent } from "@gnoworld/schemas";
import { read } from "./read.ts";

/** The data of a `card` event, as the stream gave it. */
export function cardFeed(
  told: (events: readonly CardEvent[]) => void,
  log: (what: "card_unknown") => void = () => {
    reportError(new Error("verdicts: card_unknown"));
  },
): (data: unknown) => void {
  let said = false;
  return (data) => {
    const event = read(data, CardEvent);
    if (event !== undefined) told([event]);
    else if (!said) {
      said = true;
      log("card_unknown");
    }
  };
}
