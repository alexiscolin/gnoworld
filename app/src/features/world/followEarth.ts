// The Earth's room followed by a page that has no chat (the home, the Earth): the chain's deploys for the ticker and the count of realms
// deployed in 24 h, from the one stream, into the store in batches (slice 9g). Its own chunk: the first screen loads it after it has hydrated.
import { chainFeed } from "../../lib/stream/chainFeed.ts";
import { BUSY_REST_MS, pageVerdicts } from "../../lib/stream/verdicts.ts";
import type { createAppStore } from "../../store/index.ts";

/** Follows `#earth`, again after the route's minute when the server refused or ended the stream; stops when called. */
export function followEarth(store: ReturnType<typeof createAppStore>): () => void {
  const feed = chainFeed(store.getState().chainActions);
  let stopped = false;
  let stop: () => void = () => undefined;
  let again: ReturnType<typeof setTimeout> | undefined;
  const follow = () => {
    stop = pageVerdicts(["#earth"], {
      verdict: () => undefined,
      since: () => undefined,
      dead: () => {
        stop();
        again = setTimeout(() => {
          if (!stopped) follow();
        }, BUSY_REST_MS);
      },
      chain: feed.chain,
      realms: feed.realms,
      // The ticker's stream: the Earth's chat counts who is on the Earth, never this (D374).
      uncounted: true,
    });
  };
  follow();
  return () => {
    stopped = true;
    clearTimeout(again);
    stop();
    feed.stop();
  };
}
