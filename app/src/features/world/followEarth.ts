// The Earth's room followed by a page that has no chat (the home, the Earth): the chain's deploys for the ticker and the count of realms
// deployed in 24 h, from the one stream, into the store in batches (slice 9g). Its own chunk: the first screen loads it after it has hydrated.
import { chainFeed } from "../../lib/stream/chainFeed.ts";
import { pageVerdicts } from "../../lib/stream/verdicts.ts";
import type { createAppStore } from "../../store/index.ts";

/** Follows `#earth`; stops when called. */
export function followEarth(store: ReturnType<typeof createAppStore>): () => void {
  const feed = chainFeed(store.getState().chainActions);
  const stop = pageVerdicts(["#earth"], {
    verdict: () => undefined,
    since: () => undefined,
    dead: () => undefined,
    chain: feed.chain,
    realms: feed.realms,
    // The ticker's stream: the Earth's chat counts who is on the Earth, never this (D374).
    uncounted: true,
  });
  return () => {
    stop();
    feed.stop();
  };
}
