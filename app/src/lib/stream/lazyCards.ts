// The cards' feed loaded on its first event (link-previews L4), as the chain's is (lazyChain.ts): a page whose stream never tells a card never
// loads the feed's chunk, which keeps the cards' schemas out of the first screen. Events wait for the chunk in their order.
export type CardsIn = (data: unknown) => void;

export function lazyCards(load: () => Promise<CardsIn>): CardsIn & { stop: () => void } {
  let feed: Promise<CardsIn> | undefined;
  let stopped = false;
  const card: CardsIn = (data) => {
    feed ??= load();
    feed.then(
      (loaded) => {
        if (!stopped) loaded(data);
      },
      () => {
        // A load that failed is dropped: the next event asks again.
        feed = undefined;
      },
    );
  };
  return Object.assign(card, {
    stop: () => {
      stopped = true;
    },
  });
}
