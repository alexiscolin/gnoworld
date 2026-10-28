// The browser's connection to Ergo (slice 4's 4a): one WebSocket, one IRC line a message, a login by SASL
// with a ticket asked for each connection (server/src/login/ticket.ts), the nick the address; the handshake's
// steps are handshake.ts's. Once connected, each line goes through core/irc and reaches onLine. A drop, a
// refusal or a stall waits a full-jitter share of a cap doubling from a second to a minute, starting over only
// after a minute connected (as the bot's link: F495), then reconnects with a fresh ticket; a session the
// server no longer knows stops it.
import { parseLine, type IrcMessage } from "@gnoworld/core";
import { advance, CAPS, GUEST_TRIES, guestNick, oneLine, REFUSALS, type Step } from "./handshake.ts";
import type { Result } from "../api/login.ts";
import type { Ergo, ErgoOptions, ErgoState, Socket } from "./types.ts";

export { BASIC_CAPS, CAPS, drawGuestNick } from "./handshake.ts";
export type { Ergo, ErgoOptions, ErgoState, Socket, Who } from "./types.ts";

export const BACKOFF = { firstMs: 1000, ceilingMs: 60_000 } as const;
/** The handshake's whole time: past Ergo's 9 s for its auth script. */
export const HANDSHAKE_MS = 20_000;
/** Silence after which a PING goes, and after which, unanswered, the socket closes (the bot's link's own). */
export const PING_MS = 30_000;
/** Time connected after which the backoff starts over. */
export const STABLE_MS = 60_000;

// A connection's life: its sockets one after another, its timers by name, its handshake one step at a time.
class Connection implements Ergo {
  readonly #options: ErgoOptions;
  #state: ErgoState | undefined;
  #attempt = 0;
  #generation = 0;
  #socket: Socket | undefined;
  #nick = "";
  #ticket: string | undefined;
  #refusals = 0;
  #step: Step = "caps";
  // draft/multiline: asked with the rest, then without it once Ergo NAKs the request, granted when its ACK says so.
  #multiline = true;
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

  multiline = (): boolean | undefined => (this.nick() === undefined ? undefined : this.#multiline);

  nick(): string | undefined {
    return this.#step === "connected" && this.#state === "connected" ? this.#nick : undefined;
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
    if (command === "PING") this.#write(params.length === 0 ? "PONG" : `PONG :${params[0] ?? ""}`);
    else if (this.#refused(command)) this.#refuse(command);
    else if (this.#step === "connected") this.#options.onLine(parsed.message);
    else this.#shake(this.#step, parsed.message);
  }

  // ERROR ends a connection at any step; a refusal (SASL's, a nick taken) only its handshake.
  #refused(command: string): boolean {
    return command === "ERROR" || (this.#step !== "connected" && REFUSALS.has(command));
  }

  // A guest's nick taken while it registers: another drawn; anything else refused ends the connection.
  #refuse(command: string): void {
    const { who } = this.#options;
    if (command === "433" && this.#step === "registering" && "guest" in who) this.#renick(who.guest);
    else this.#fail();
  }

  // The move a line makes at a step of the handshake: lines sent and the next step, a failure, or connected.
  #shake(step: Exclude<Step, "connected">, message: IrcMessage): void {
    // Ergo's welcome names the nick it took; none, or *, leaves the one sent.
    const [named = ""] = message.params;
    if (message.command === "001" && named !== "" && named !== "*") this.#nick = named;
    const move = advance(step, message, { nick: this.#nick, ticket: this.#ticket, multiline: this.#multiline });
    if (move === undefined) return;
    if ("next" in move) {
      this.#step = move.next;
      if (move.multiline !== undefined) this.#multiline = move.multiline;
      for (const line of move.send) this.#write(line);
    } else if (move.end === "fail") {
      this.#fail();
    } else {
      this.#connected();
    }
  }

  // A guest's nick taken: another one drawn, GUEST_TRIES in all, then this connection fails; so does a draw
  // that gives no nick.
  #renick(draw: () => string): void {
    this.#refusals += 1;
    const nick = this.#refusals < GUEST_TRIES ? guestNick(draw) : undefined;
    if (nick === undefined) {
      this.#fail();
      return;
    }
    this.#nick = nick;
    this.#write(`NICK ${nick}`);
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
    const { who } = this.#options;
    if ("guest" in who) {
      const nick = guestNick(who.guest);
      if (nick === undefined) this.#fail();
      else this.#open(nick, undefined);
      return;
    }
    let got: Result<{ ticket: string }>;
    try {
      got = await who.ticket();
    } catch {
      got = { ok: false, reason: "network" };
    }
    if (mine !== this.#generation) return; // stopped, or ended, meanwhile
    if (!got.ok && got.reason === "unauthenticated") this.#set("logged-out");
    else if (!got.ok || got.value.ticket === "") this.#wait();
    else this.#open(who.account, got.value.ticket);
  }

  #open(nick: string, ticket: string | undefined): void {
    this.#nick = nick;
    this.#ticket = ticket;
    this.#refusals = 0;
    this.#step = "caps";
    this.#multiline = true;
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
  return connection;
}
