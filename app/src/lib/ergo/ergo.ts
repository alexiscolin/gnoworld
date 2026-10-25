// The browser's connection to Ergo (slice 4's 4a): one WebSocket, one IRC line a message, a login by SASL
// with a ticket asked for each connection (server/src/login/ticket.ts), the nick the address; the handshake's
// steps are handshake.ts's. Once connected, each line goes through core/irc and reaches onLine. A drop, a
// refusal or a stall waits a full-jitter share of a cap doubling from a second to a minute, starting over only
// after a minute connected (as the bot's link: F495), then reconnects with a fresh ticket; a session the
// server no longer knows stops it.
import { parseLine, type IrcMessage } from "@gnoworld/core";
import type { Address } from "@gnoworld/schemas";
import type { Result } from "../api/login.ts";
import { advance, CAPS, oneLine, REFUSALS, type Step } from "./handshake.ts";

export { CAPS } from "./handshake.ts";

export const BACKOFF = { firstMs: 1000, ceilingMs: 60_000 } as const;
/** The handshake's whole time: past Ergo's 9 s for its auth script. */
export const HANDSHAKE_MS = 20_000;
/** Silence after which a PING goes, and after which, unanswered, the socket closes (the bot's link's own). */
export const PING_MS = 30_000;
/** Time connected after which the backoff starts over. */
export const STABLE_MS = 60_000;

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
  address: Address;
  ticket: () => Promise<Result<{ ticket: string }>>;
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
}

// A connection's life: its sockets one after another, its timers by name, its handshake one step at a time.
class Connection {
  readonly #options: ErgoOptions;
  #state: ErgoState | undefined;
  #attempt = 0;
  #generation = 0;
  #socket: Socket | undefined;
  #ticket = "";
  #step: Step = "caps";
  readonly #timers = new Map<string, () => void>();
  constructor(options: ErgoOptions) {
    this.#options = options;
  }

  start(): void {
    this.#run();
  }

  send(line: string): boolean {
    return this.#step === "connected" && this.#state === "connected" && oneLine(line) && this.#write(line);
  }

  stop(): void {
    if (this.#state === "stopped") return;
    this.#set("stopped");
    this.#fail();
  }

  #set(next: ErgoState): void {
    if (this.#state === next || this.#state === "stopped") return;
    this.#state = next;
    this.#options.onState(next);
  }

  #clear(name: string): void {
    this.#timers.get(name)?.();
    this.#timers.delete(name);
  }

  #timer(name: string, ms: number, run: () => void): void {
    this.#clear(name);
    this.#timers.set(name, this.#options.after(ms, run));
  }

  // The end of a socket, once: its events dropped, its timers cleared, a wait set unless stopped or logged out.
  #fail(): void {
    const ending = this.#socket;
    this.#socket = undefined;
    this.#generation += 1;
    for (const name of [...this.#timers.keys()]) this.#clear(name);
    if (ending !== undefined) {
      ending.onopen = null;
      ending.onmessage = null;
      ending.onclose = null;
      ending.close();
    }
    if (this.#state !== "stopped" && this.#state !== "logged-out") this.#wait();
  }

  #wait(): void {
    const cap = Math.min(BACKOFF.firstMs * 2 ** this.#attempt, BACKOFF.ceilingMs);
    this.#attempt += 1;
    this.#set("waiting");
    this.#timer("backoff", this.#options.random() * cap, () => {
      this.#timers.delete("backoff");
      this.#run();
    });
  }

  #write(line: string): boolean {
    try {
      this.#socket?.send(line);
      return this.#socket !== undefined;
    } catch {
      return false;
    }
  }

  // A line from Ergo: PING at any step, ERROR and a refusal end it, the rest by its step.
  #hear(text: string): void {
    const parsed = parseLine(text);
    if (!parsed.ok) return;
    const { command, params } = parsed.message;
    if (this.#step === "connected") this.#silent();
    if (command === "PING") {
      this.#write(params.length === 0 ? "PONG" : `PONG :${params[0] ?? ""}`);
    } else if (command === "ERROR" || (this.#step !== "connected" && REFUSALS.has(command))) {
      this.#fail();
    } else if (this.#step === "connected") {
      this.#options.onLine(parsed.message);
    } else {
      this.#shake(this.#step, parsed.message);
    }
  }

  // The move a line makes at a step of the handshake: lines sent and the next step, a failure, or connected.
  #shake(step: Exclude<Step, "connected">, message: IrcMessage): void {
    const move = advance(step, message, { address: this.#options.address, ticket: this.#ticket });
    if (move === undefined) return;
    if ("next" in move) {
      this.#step = move.next;
      for (const line of move.send) this.#write(line);
    } else if (move.end === "fail") {
      this.#fail();
    } else {
      this.#connected();
    }
  }

  #connected(): void {
    this.#step = "connected";
    this.#clear("handshake");
    this.#set("connected");
    this.#silent();
    this.#timer("stable", STABLE_MS, () => {
      this.#timers.delete("stable");
      this.#attempt = 0;
    });
  }

  // Silence once connected: a PING after PING_MS, the socket closed after as long again unanswered.
  #silent(): void {
    this.#timer("silence", PING_MS, () => {
      this.#write("PING :gnoworld");
      this.#timer("silence", PING_MS, () => {
        this.#fail();
      });
    });
  }

  // One try: a ticket, then a socket; a failure past every step waits for the next try.
  #run(): void {
    this.#begin().catch(() => {
      this.#fail();
    });
  }

  async #begin(): Promise<void> {
    if (this.#state === "stopped") return;
    const mine = (this.#generation += 1);
    this.#set("connecting");
    let got: Result<{ ticket: string }>;
    try {
      got = await this.#options.ticket();
    } catch {
      got = { ok: false, reason: "network" };
    }
    if (mine !== this.#generation) return; // stopped, or ended, meanwhile
    if (!got.ok && got.reason === "unauthenticated") this.#set("logged-out");
    else if (!got.ok || got.value.ticket === "") this.#wait();
    else this.#open(got.value.ticket);
  }

  #open(ticket: string): void {
    this.#ticket = ticket;
    this.#step = "caps";
    const opened = this.#options.open(this.#options.url);
    this.#socket = opened;
    this.#timer("handshake", HANDSHAKE_MS, () => {
      this.#fail();
    });
    opened.onopen = () => {
      this.#write("CAP LS 302");
      this.#write(`CAP REQ :${CAPS}`);
    };
    opened.onmessage = (event) => {
      if (typeof event.data === "string") this.#hear(event.data);
    };
    opened.onclose = () => {
      this.#fail();
    };
  }
}

/** Connects to Ergo and keeps connecting until stopped or logged out. */
export function connectErgo(options: ErgoOptions): Ergo {
  const connection = new Connection(options);
  connection.start();
  return {
    send: (line) => connection.send(line),
    stop: () => {
      connection.stop();
    },
  };
}
