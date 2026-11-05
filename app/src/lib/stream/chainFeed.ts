// The page's feed of the chain (slice 9g), a chunk of its own that a page loads when the stream first tells the chain (the first screen holds none of it): each
// event through its schema, a frame that fails dropped and said once, then into the store in batches. The server tells at most 4 events
// a second a room, so a window of 100 ms joins a burst into one update of the store, one render, however many frames came.
import { ChainEvent, RealmsDeployed } from "@gnoworld/schemas/indexer";
import { read } from "./read.ts";

/** The window a burst is joined in, and the events held at most while it waits. */
export const BATCH_MS = 100;
const HELD = 1000;

/** What the feed gives the store: a batch of events, and a count. */
export interface ChainActions {
  heard: (events: readonly ChainEvent[]) => void;
  counted: (count: RealmsDeployed) => void;
}

export interface ChainFeed {
  /** The data of a `chain` event and of a `realms` event, as the stream gave it. */
  chain: (data: unknown) => void;
  realms: (data: unknown) => void;
  /** Stops: the window's timer is cancelled, so what is held is never handed on, the page having left. */
  stop: () => void;
}

export function chainFeed(
  { heard, counted }: ChainActions,
  log: (what: "chain_unknown" | "realms_unknown") => void = (what) => {
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
  const told = new Set<string>();
  const unknown = (what: "chain_unknown" | "realms_unknown"): void => {
    if (!told.has(what)) log(what);
    told.add(what);
  };
  return {
    chain: (data) => {
      const event = read(data, ChainEvent);
      if (event === undefined) {
        unknown("chain_unknown");
        return;
      }
      held = [...held, event].slice(-HELD);
      cancel ??= schedule(() => {
        cancel = undefined;
        heard(held.splice(0));
      }, BATCH_MS);
    },
    realms: (data) => {
      const count = read(data, RealmsDeployed);
      if (count === undefined) unknown("realms_unknown");
      else counted(count);
    },
    stop: () => {
      cancel?.();
    },
  };
}
