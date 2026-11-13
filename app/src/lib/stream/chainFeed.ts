// The page's feed of the chain (slice 9g), a chunk of its own that a page loads when the stream first tells the chain (the first screen holds none of it): each
// event through its schema, a frame that fails dropped and said once, then into the store in batches. The server tells at most 4 events
// a second a room, so a window of 100 ms joins a burst into one update of the store, one render, however many frames came.
import { ChainEvent } from "@gnoworld/schemas/chainEvents";
import { read } from "./read.ts";

/** The window a burst is joined in, and the events held at most while it waits. */
export const BATCH_MS = 100;
const HELD = 1000;

/** What the feed gives the store: a batch of events. */
export interface ChainActions {
  heard: (events: readonly ChainEvent[]) => void;
}

export interface ChainFeed {
  /** The data of a `chain` event, as the stream gave it. */
  chain: (data: unknown) => void;
  /** Stops: the window's timer is cancelled, so what is held is never handed on, the page having left. */
  stop: () => void;
}

export function chainFeed(
  { heard }: ChainActions,
  log: (what: "chain_unknown") => void = (what) => {
    reportError(new Error(`verdicts: ${what}`));
  },
  schedule: (run: () => void, ms: number) => () => void = (run, ms) => {
    const id = setTimeout(run, ms);
    return () => {
      clearTimeout(id);
    };
  },
): ChainFeed {
  let held: ChainEvent[] = [];
  let cancel: (() => void) | undefined;
  let told = false;
  return {
    chain: (data) => {
      const event = read(data, ChainEvent);
      if (event === undefined) {
        if (!told) log("chain_unknown");
        told = true;
        return;
      }
      held = [...held, event].slice(-HELD);
      cancel ??= schedule(() => {
        cancel = undefined;
        heard(held.splice(0));
      }, BATCH_MS);
    },
    stop: () => {
      cancel?.();
    },
  };
}
