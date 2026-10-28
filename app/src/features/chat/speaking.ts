// What the link sends for the account (slice 4's 4c to 4e, 4d's DM bar and the room's edits), moved out of link.ts for the
// lint's sizes: its lines to a room or to another account, a correction, a reaction, a delete, its typing; each an account's alone,
// a room's in a room Ergo says it is in. Whether each went.
import type { Composed, Reacting } from "@gnoworld/core";
import type { Ergo } from "../../lib/ergo/ergo.ts";
import type { createAppStore } from "../../store/index.ts";
import { reactInRoom, reactTo, redactFrom, redactIn, sayTo, speakIn, type DmOut } from "./dmOut.ts";
import type { Say } from "./linkTypes.ts";
import { Pace, tooFast, type Slow } from "./pace.ts";
import type { Outbox } from "./outbox.ts";
import type { TypingOut } from "./telling.ts";

/** What the link lends: the connection, the key of its session ("guest" or an address), the rooms Ergo said I am in, and
 * the ways out. */
export interface Host {
  ergo: () => Ergo | undefined;
  key: () => string | undefined;
  inside: ReadonlySet<string>;
  outbox: Outbox;
  typing: TypingOut;
  store: ReturnType<typeof createAppStore>;
}

interface Tags {
  reply?: string | undefined;
  edit?: string | undefined;
}

export class Speaking {
  readonly #host: Host;
  // The next batch's reference, one a connection's own: letters and digits, as Ergo takes them (irc/utils/args.go).
  #batches = 0;
  // What the account sent in the last minute, against the server's rates (F2092).
  readonly #pace = new Pace();

  constructor(host: Host) {
    this.#host = host;
  }

  readonly say = (room: string, composed: Composed, reply?: string): boolean => this.#speak(room, composed, { reply });

  readonly correct = (room: string, composed: Composed, edit: string): boolean => this.#speak(room, composed, { edit });

  readonly sayTo = (partner: string, say: Say, tags?: { reply?: string; edit?: string }): boolean =>
    sayTo(this.#dm(), { partner, ...say }, tags);

  readonly reactTo = (partner: string, reaction: Reacting): boolean => reactTo(this.#dm(), partner, reaction);

  readonly redactIn = (partner: string, id: string): boolean => redactIn(this.#dm(), partner, id);

  readonly redact = (room: string, id: string): boolean =>
    redactFrom(this.#dm(), { room, id, inside: this.#host.inside.has(room) });

  readonly react = (room: string, reaction: Reacting): boolean =>
    reactInRoom(this.#dm(), { room, inside: this.#host.inside.has(room) }, reaction);

  // Tells a room Ergo says it is in the account is typing (+typing), at most each 3 s; an account's alone. Whether it may.
  readonly typing = (room: string, state: "active" | "done"): boolean => {
    const { ergo, key, inside, typing } = this.#host;
    const may = key() !== "guest" && inside.has(room);
    if (may) typing.tell(room, state, (line) => ergo()?.send(line) === true);
    return may;
  };

  /** Why a message of a room is held back for the server's pace, none when it may go (F2092). */
  readonly slow = (composed: Composed): string | undefined => {
    const slow = this.#slow(composed);
    return slow === undefined ? undefined : tooFast(slow);
  };

  // What of the account's minute a message of a room takes: its lines, and its messages, one more each when the
  // connection sends the lines one at a time.
  #weight(composed: Composed): { messages: number; lines: number } {
    const lines = composed.kind === "lines" ? composed.lines.length : composed.kind === "line" ? 1 : 0;
    return { messages: this.#host.ergo()?.multiline() === false ? lines : Math.min(lines, 1), lines };
  }

  #slow(composed: Composed): Slow | undefined {
    const { messages, lines } = this.#weight(composed);
    return this.#pace.slow(Date.now(), messages, lines);
  }

  #speak(room: string, composed: Composed, tags: Tags): boolean {
    if (this.#slow(composed) !== undefined) return false;
    const went = speakIn(this.#dm(), { room, composed, inside: this.#host.inside.has(room) }, tags);
    if (went) {
      const { messages, lines } = this.#weight(composed);
      this.#pace.record(Date.now(), messages, lines);
      this.#host.typing.ended(room);
    }
    return went;
  }

  // What the lines are sent with (dmOut.ts).
  #dm(): DmOut {
    const { ergo, key, outbox, store } = this.#host;
    return { ergo: ergo(), key: key(), outbox, store, ref: () => `ml${(this.#batches++).toString(36)}` };
  }
}
