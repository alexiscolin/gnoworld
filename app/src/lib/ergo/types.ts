// The shapes of the connection to Ergo (ergo.ts): its states, the socket it drives, what it is given and gives.
import type { IrcMessage } from "@gnoworld/core";
import type { Who } from "./handshake.ts";

export type { Who };

export type ErgoState = "connecting" | "connected" | "waiting" | "logged-out" | "stopped";

/** The part of a WebSocket this uses: the browser's, or a test's. */
export interface Socket {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  send: (data: string) => void;
  close: () => void;
}

export interface ErgoOptions {
  url: string;
  who: Who;
  open: (url: string) => Socket;
  onState: (state: ErgoState) => void;
  onLine: (line: IrcMessage) => void;
  random: () => number;
  /** Runs `run` after `ms`; the function it gives cancels it. */
  after: (ms: number, run: () => void) => () => void;
}

export interface Ergo {
  /** Sends one line once connected; false when it is not one line, or not connected. */
  send: (line: string) => boolean;
  stop: () => void;
  /** The nick Ergo's welcome (001) named, else the last one sent, while connected; undefined otherwise. */
  nick: () => string | undefined;
}
