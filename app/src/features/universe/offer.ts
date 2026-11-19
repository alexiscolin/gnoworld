import { Heard } from "../../lib/heard.ts";

/** Where the offer of space stands: not decided yet, taken (space runs or loads), waiting for the reader's ask, never (a weak GPU), or
 * failed (its chunk or WebGL refused). */
export const offer = {
  state: "undecided" as "undecided" | "taken" | "ask" | "none" | "failed",
  heard: new Heard(),
};

export function tellOffer(state: typeof offer.state): void {
  offer.state = state;
  offer.heard.tell();
}
