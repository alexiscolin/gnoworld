// What the chain told of a world, given to the thread of its main room (slice 9g, frames 20 to 35): the page that holds the room gives the
// calls and the place through these contexts (each a value that stands between renders), and the room's lines draw each call as a card
// among the messages (chainEntries.ts), placed by the time it was heard. Only the contexts are here: the first screen holds no more of it.
import { createContext } from "react";
import type { ChainHeard } from "../../store/chain.ts";

/** The calls the chain told of the world, as the store holds them. */
export const ChainCallsContext = createContext<readonly ChainHeard[]>([]);

/** The world whose main room draws the calls, and its universe: a world's name is not unique to a chain, so another universe's calls are never drawn. */
export interface ChainPlace {
  slug: string;
  universe: string;
}
export const ChainPlaceContext = createContext<ChainPlace | undefined>(undefined);
