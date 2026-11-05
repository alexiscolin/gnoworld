// A universe's one poll of its public indexer over HTTP (slice 9g, answer 9g-4, by Alexis): once a block it asks the tip, and when
// the tip moved it asks the transactions from the cursor on (indexer.ts), each text read by message.ts. A failed round backs off with
// a jitter and leaves the cursor, so the next good one reads the gap; a transaction is read once by its hash. Nothing is kept that
// the indexer can give again: the hashes are bounded. One round at a time, each with its time limit; no socket, no held frames.
import { readChainMessage, type ChainContext, type ChainRead } from "./message.ts";

type PollLog = "chain_message_bad" | "chain_poll_failed";

export interface PollOptions {
  universe: string;
  watch: ChainContext["watch"];
  /** The newest block the indexer holds. */
  tip: () => Promise<number>;
  /** The transactions from this height on, as the subscription's own texts. */
  catchUp: (from: number) => Promise<string[]>;
  random: () => number;
  deliver: (read: ChainRead) => void;
  /** The height already read before the first round (the day's history reached it): the first catch-up starts from it. */
  from?: number | undefined;
  log: (what: PollLog) => void;
  /** Runs `run` in `ms` unless the returned function is called first. */
  after?: (ms: number, run: () => void) => () => void;
}

/** A block every 3.4 s on Onyx: a round starts this long after the last one ended. */
export const POLL_MS = 3400;
/** A round that does not end within this is given up, like one that fails. */
export const CATCH_UP_MS = 30_000;
/** The hashes kept to read a transaction once. */
export const SEEN = 10_000;
const BACKOFF_MS = 1000;
const BACKOFF_MAX_MS = 30_000;

/** A timer that can be cancelled: `after`'s default. */
export const timer = (ms: number, run: () => void): (() => void) => {
  const id = setTimeout(run, ms);
  return () => {
    clearTimeout(id);
  };
};

const heightOf = (read: ChainRead): number => read.block?.height ?? read.height ?? 0;

// What was delivered: a transaction once by its hash, the last SEEN of them (the oldest hash goes first), and the highest height.
function delivery(deliver: PollOptions["deliver"], from: number | undefined) {
  const seen = new Set<string>();
  let highest = from;
  return {
    emit: (read: ChainRead): void => {
      if (read.hash !== undefined) {
        if (seen.has(read.hash)) return;
        seen.add(read.hash);
        if (seen.size > SEEN) seen.delete(seen.values().next().value ?? "");
      }
      if (read.block !== undefined || read.height !== undefined) highest = Math.max(highest ?? 0, heightOf(read));
      deliver(read);
    },
    highest: (): number | undefined => highest,
  };
}

export function pollChain(options: PollOptions): { stop: () => void } {
  const { tip, catchUp, random, deliver, log, after = timer } = options;
  const context: ChainContext = { universe: options.universe, watch: options.watch, log };
  const { emit, highest } = delivery(deliver, options.from);
  // The height the tip was last caught up to, and the one the next catch-up starts from (this block read again, once by its hash).
  let asked = options.from;
  let stopped = false;
  let attempt = 0;
  let cancel: (() => void) | undefined;

  // One round: its reads and deliveries, none once `alive` says the round was given up or the poll stopped.
  async function read(alive: () => boolean): Promise<void> {
    const height = await tip();
    if (!alive()) return;
    if (asked === undefined) asked = height;
    else if (height > asked) {
      const texts = await catchUp(highest() ?? asked);
      if (!alive()) return;
      for (const text of texts) emit(readChainMessage(text, context));
      asked = height;
    }
    deliver({ events: [], tip: height });
  }

  function round(): void {
    let live = true;
    const end = (worked: boolean): void => {
      if (!live) return;
      live = false;
      cancelLimit();
      if (stopped) return;
      if (worked) attempt = 0;
      else log("chain_poll_failed");
      const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MS * 2 ** attempt);
      if (!worked) attempt += 1;
      cancel = after(worked ? POLL_MS : base / 2 + (base / 2) * random(), round);
    };
    const cancelLimit = after(CATCH_UP_MS, () => {
      end(false);
    });
    cancel = () => {
      live = false;
      cancelLimit();
    };
    read(() => live).then(
      () => {
        end(true);
      },
      () => {
        end(false);
      },
    );
  }
  round();
  return {
    stop() {
      stopped = true;
      cancel?.();
    },
  };
}
