// A universe's one poll of its public indexer over HTTP (slice 9g, answer 9g-4, by Alexis): once a block it asks the tip, and when
// the tip moved it asks the transactions after the cursor, a page at a time, each row read by message.ts. The cursor is a place,
// (height, index), moved as each row is delivered, so a block of any size is read across pages and rounds and a slow indexer still
// advances. A failed round backs off with a jitter and leaves the cursor; a transaction is read once by its hash (the hashes are
// bounded). One round at a time; each request has its own time limit, and a stop aborts the round's requests.
import type { Place } from "@gnoworld/chain/transactions";
import type { Page } from "./indexer.ts";
import { readChainRow, type ChainContext, type ChainRead } from "./message.ts";

type PollLog =
  "chain_message_bad" | "chain_poll_failed" | "chain_height_ahead" | "chain_tip_back" | "chain_catch_up_capped";

export interface PollOptions {
  universe: string;
  watch: ChainContext["watch"];
  /** The newest block the indexer holds. */
  tip: (signal: AbortSignal) => Promise<number>;
  /** A page of the transactions after a place, up to a tip. */
  catchUp: (after: Place, tip: number, signal: AbortSignal) => Promise<Page>;
  random: () => number;
  deliver: (read: ChainRead) => void;
  /** The block the day's history reached, whose rows were all read: the first catch-up starts after it. */
  from?: number | undefined;
  log: (what: PollLog) => void;
  /** Runs `run` in `ms` unless the returned function is called first. */
  after?: (ms: number, run: () => void) => () => void;
}

/** A block every 3.4 s on Onyx: a round starts this long after the last one ended. */
export const POLL_MS = 3400;
/** The pages a round asks at most (a gap longer than that is read over the next rounds). */
export const PAGES = 5;
/** The hashes kept to read a transaction once. */
export const SEEN = 10_000;
const BACKOFF_MS = 1000;
const BACKOFF_MAX_MS = 30_000;

// Where the poll stands: the place of the last row passed, and the tip last caught up to (a tip that did not move asks nothing).
interface State {
  cursor: Place;
  caught: number;
}

const stopped = (signal: AbortSignal): boolean => signal.aborted;

/** A timer that can be cancelled: `after`'s default. */
export const timer = (ms: number, run: () => void): (() => void) => {
  const id = setTimeout(run, ms);
  return () => {
    clearTimeout(id);
  };
};

// Whether a transaction is new: once by its hash, the last SEEN of them (the oldest hash goes first).
function fresh() {
  const seen = new Set<string>();
  return (hash: string): boolean => {
    if (seen.has(hash)) return false;
    seen.add(hash);
    if (seen.size > SEEN) {
      const [oldest = hash] = seen;
      seen.delete(oldest);
    }
    return true;
  };
}

// One page's rows, each delivered and the cursor moved as it comes; a row above the tip is said and passed over.
function taker(deliver: PollOptions["deliver"], context: ChainContext, log: PollOptions["log"]) {
  const isNew = fresh();
  return (got: Page, height: number, place: Place): Place => {
    let at = got.skipped ?? place;
    const times = new Map(got.times);
    for (const row of got.rows) {
      if (row.height > height) {
        log("chain_height_ahead");
        continue;
      }
      const time = times.get(row.height);
      if (time !== undefined) {
        deliver({ events: [], block: { height: row.height, time: new Date(time).toISOString() } });
        times.delete(row.height);
      }
      const read = readChainRow(row.row, context);
      if (read.hash !== undefined && isNew(read.hash)) deliver(read);
      at = { height: row.height, index: row.index };
    }
    return at;
  };
}

export function pollChain(options: PollOptions): { stop: () => void } {
  const { tip, catchUp, random, deliver, log, after = timer } = options;
  const context: ChainContext = { universe: options.universe, watch: options.watch, log };
  const take = taker(deliver, context, log);
  const start = (height: number): State => ({ cursor: { height }, caught: height });
  let state = options.from === undefined ? undefined : start(options.from);
  let attempt = 0;
  // Always set: the first round starts before pollChain returns.
  let cancel: () => void;

  // The pages of one catch-up, up to the tip: each page's rows delivered and the cursor moved as it comes.
  async function catchUpTo(at: State, height: number, signal: AbortSignal): Promise<void> {
    for (let pages = 0; pages < PAGES; pages += 1) {
      const got = await catchUp(at.cursor, height, signal);
      if (stopped(signal)) return;
      const moved = take(got, height, at.cursor);
      const stuck = moved === at.cursor && got.rows.length > 0;
      at.cursor = moved;
      if (!got.more) {
        at.caught = height;
        return;
      }
      if (stuck) return;
    }
    log("chain_catch_up_capped");
  }

  // One round: its reads and deliveries, none once the round was aborted (the poll was stopped).
  async function read(signal: AbortSignal): Promise<void> {
    const height = await tip(signal);
    if (stopped(signal)) return;
    if (state === undefined) state = start(height);
    else if (height < Math.max(state.caught, state.cursor.height)) {
      log("chain_tip_back");
      state = start(height);
    } else if (height > state.caught) {
      await catchUpTo(state, height, signal);
      if (stopped(signal)) return;
    }
    deliver({ events: [], tip: height });
  }

  function round(): void {
    const controller = new AbortController();
    cancel = () => {
      controller.abort();
    };
    const end = (worked: boolean): void => {
      if (controller.signal.aborted) return;
      if (worked) attempt = 0;
      else log("chain_poll_failed");
      const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MS * 2 ** attempt);
      if (!worked) attempt += 1;
      cancel = after(worked ? POLL_MS : base / 2 + (base / 2) * random(), round);
    };
    read(controller.signal).then(
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
      cancel();
    },
  };
}
