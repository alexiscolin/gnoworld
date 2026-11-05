// A universe's one subscription to its public indexer (slice 9g), on `graphql-transport-ws`: init, subscribe to the transactions and
// the blocks once acknowledged, every text read by message.ts. A lost socket reconnects with a jittered backoff and a catch-up
// by block height, so nothing is missed (a transaction the catch-up and the live socket both give is read once, by its hash).
// Nothing is kept that the indexer can give again: the hashes and the live frames held during a catch-up are bounded.
import { readChainMessage, type ChainContext, type ChainRead } from "./message.ts";
import { subscriptionsOf } from "@gnoworld/chain/transactions";
import { jsonOf } from "@gnoworld/core";
import { z } from "zod";

/** What of a WebSocket the follower uses, so a test hands its own. */
export interface ChainSocket {
  send: (text: string) => void;
  close: () => void;
  addEventListener: (
    type: "open" | "message" | "close" | "error",
    listener: (event: { data?: unknown }) => void,
  ) => void;
}

type FollowLog =
  | "chain_message_bad"
  | "chain_catch_up_failed"
  | "chain_subscription_refused"
  | "chain_socket_timeout"
  | "chain_held_dropped";

export interface FollowOptions {
  universe: string;
  url: string;
  watch: ChainContext["watch"];
  open: (url: string, protocol: string) => ChainSocket;
  /** The transactions from this height on, as the subscription's own texts. */
  catchUp: (from: number) => Promise<string[]>;
  wait: (ms: number) => Promise<void>;
  random: () => number;
  deliver: (read: ChainRead) => void;
  /** The height already read before the first socket (the day's history reached it): the first connection catches up from it. */
  from?: number;
  log: (what: FollowLog) => void;
  /** Runs `run` in `ms` unless the returned function is called first. */
  after?: (ms: number, run: () => void) => () => void;
}

/** A socket that never acknowledges, one silent after, and a catch-up that never answers, are each ended and replaced. */
export const ACK_MS = 15_000;
export const IDLE_MS = 60_000;
export const CATCH_UP_MS = 30_000;
/** The hashes kept to read a transaction once, and the live reads held during a catch-up. */
export const SEEN = 10_000;
export const HELD = 10_000;
const BACKOFF_MS = 1000;
const BACKOFF_MAX_MS = 30_000;

/** A timer that can be cancelled: `after`'s default. */
export const timer = (ms: number, run: () => void): (() => void) => {
  const id = setTimeout(run, ms);
  return () => {
    clearTimeout(id);
  };
};

// A control frame is a few bytes: a longer text is a transaction or a block, which message.ts reads.
function controlOf(text: string): string | undefined {
  if (text.length > 256) return undefined;
  const frame = z.object({ type: z.string() }).safeParse(jsonOf(text));
  return frame.success ? frame.data.type : undefined;
}

/** The catch-up asked within its time: a catch-up that never answers fails like one that refuses. */
function askCatchUp(
  catchUp: FollowOptions["catchUp"],
  from: number,
  after: NonNullable<FollowOptions["after"]>,
): Promise<string[]> {
  return new Promise<string[]>((resolve, reject) => {
    const drop = after(CATCH_UP_MS, () => {
      reject(new Error("the catch-up did not answer"));
    });
    catchUp(from).then(
      (texts) => {
        drop();
        resolve(texts);
      },
      (error: unknown) => {
        drop();
        reject(error instanceof Error ? error : new Error("the catch-up failed"));
      },
    );
  });
}

const heightOf = (read: ChainRead): number => read.block?.height ?? read.height ?? 0;

// What was delivered: a transaction once by its hash, the last SEEN of them (the oldest hash goes first), and the highest height.
function delivery(deliver: FollowOptions["deliver"], from: number | undefined) {
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

/** What one socket's session shares with the follower: its settings, its state, and how to end and to deliver. */
interface Shared {
  options: FollowOptions;
  context: ChainContext;
  emit: (read: ChainRead) => void;
  highest: () => number | undefined;
  /** Backs off, then connects again. */
  reconnect: () => void;
  resetBackoff: () => void;
}

// One socket: its init, its subscriptions once acknowledged, the catch-up and the frames held while it asks, its silence.
function session({ options, context, emit, highest, reconnect, resetBackoff }: Shared): () => void {
  const { url, watch, open, catchUp, log, after = timer } = options;
  const socket = open(url, "graphql-transport-ws");
  let over = false;
  let cancel: (() => void) | undefined;
  // The live reads held while a catch-up asks, in the order they came.
  let held: ChainRead[] | undefined;
  const close = (): void => {
    if (over) return;
    over = true;
    cancel?.();
    socket.close();
    reconnect();
  };
  const arm = (ms: number): void => {
    cancel?.();
    cancel = after(ms, () => {
      log("chain_socket_timeout");
      close();
    });
  };
  const catchingUp = (from: number): void => {
    held = [];
    askCatchUp(catchUp, from, after).then(
      (texts) => {
        if (over) return;
        resetBackoff();
        for (const text of texts) emit(readChainMessage(text, context));
        const live = held ?? [];
        held = undefined;
        for (const read of live.toSorted((a, b) => heightOf(a) - heightOf(b))) emit(read);
      },
      () => {
        if (over) return;
        log("chain_catch_up_failed");
        close();
      },
    );
  };
  const live = (read: ChainRead): void => {
    if (read.refused === true) {
      log("chain_subscription_refused");
      close();
    } else if (held === undefined) emit(read);
    else {
      held.push(read);
      if (held.length > HELD) {
        held.shift();
        log("chain_held_dropped");
      }
    }
  };
  const hear = (text: string): void => {
    const control = controlOf(text);
    if (control === "ping") socket.send(JSON.stringify({ type: "pong" }));
    else if (control !== "connection_ack") live(readChainMessage(text, context));
    else {
      for (const { id, query } of subscriptionsOf(watch.keys()))
        socket.send(JSON.stringify({ id, type: "subscribe", payload: { query } }));
      // A socket that asks a catch-up has not worked until the catch-up answers: else a failing one would retry every second.
      const from = highest();
      if (from === undefined) resetBackoff();
      else catchingUp(from);
    }
    if (!over) arm(IDLE_MS);
  };
  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ type: "connection_init" }));
  });
  socket.addEventListener("message", ({ data }) => {
    if (!over && typeof data === "string") hear(data);
  });
  socket.addEventListener("close", close);
  socket.addEventListener("error", close);
  // Never opened or never acknowledged: ended like a socket gone silent.
  arm(ACK_MS);
  return close;
}

export function followChain(options: FollowOptions): { stop: () => void } {
  const { wait, random } = options;
  const context: ChainContext = { universe: options.universe, watch: options.watch, log: options.log };
  const { emit, highest } = delivery(options.deliver, options.from);
  let stopped = false;
  let attempt = 0;
  let end: (() => void) | undefined;
  const reconnect = (): void => {
    end = undefined;
    if (stopped) return;
    const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MS * 2 ** attempt);
    attempt += 1;
    wait(base / 2 + (base / 2) * random()).then(connect, () => undefined);
  };
  function connect(): void {
    if (!stopped) end = session({ options, context, emit, highest, reconnect, resetBackoff: () => (attempt = 0) });
  }
  connect();
  return {
    stop() {
      stopped = true;
      end?.();
    },
  };
}
