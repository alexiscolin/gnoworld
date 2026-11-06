// The chain's feed loaded on its first event (slice 9g): a page whose stream never tells the chain never loads the feed's chunk (its schemas
// and its batching), which keeps it out of the first screen (budgets.spec.ts). Events wait for the chunk in their order.
import type { ChainFeed } from "./chainFeed.ts";

export function lazyChain(load: () => Promise<ChainFeed>): ChainFeed {
  let feed: Promise<ChainFeed> | undefined;
  let stopped = false;
  const then = (use: (feed: ChainFeed) => void): void => {
    feed ??= load();
    feed.then(
      (loaded) => {
        if (!stopped) use(loaded);
      },
      () => {
        // A load that failed is dropped: the next event asks again.
        feed = undefined;
      },
    );
  };
  const forward = (name: "chain" | "realms") => (data: unknown) => {
    then((loaded) => {
      loaded[name](data);
    });
  };
  return {
    chain: forward("chain"),
    realms: forward("realms"),
    stop: () => {
      stopped = true;
      feed?.then((loaded) => {
        loaded.stop();
      }, ignore);
    },
  };
}

const ignore = () => undefined;
