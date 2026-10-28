// The server's two rates on an account's messages, which the page keeps so as not to send what is hidden: 20 messages
// and 100 lines a minute (server/src/moderation/check.ts and rate.ts), each hide a strike on the account (F2092).
const MINUTE = 60_000;
const MESSAGES = 20;
const LINES = 100;

/** The limit a message would pass, and how many ms until it may go. */
export interface Slow {
  limit: "messages" | "lines";
  wait: number;
}

interface Sent {
  at: number;
  messages: number;
  lines: number;
}

/** Why the pace keeps a message back, and for how long: what the field says (said.ts shows it as its error). Here and
 * not in said.ts, which the link would then carry into a visitor's first screen. */
export const tooFast = ({ limit, wait }: Slow): string =>
  `Too fast: ${limit === "messages" ? `${String(MESSAGES)} messages` : `${String(LINES)} lines`} a minute at most. Try again in ${String(Math.ceil(wait / 1000))} s.`;

export class Pace {
  // What went in the last minute, oldest first: at most 20 entries, as one that goes passes the check.
  #sent: Sent[] = [];

  /** Whether `messages` messages of `lines` lines in all, sent at `now`, pass a rate, and when they would not. */
  slow(now: number, messages: number, lines: number): Slow | undefined {
    const held = this.#sent.filter(({ at }) => at + MINUTE > now);
    const total = { messages, lines };
    for (const sent of held) {
      total.messages += sent.messages;
      total.lines += sent.lines;
    }
    const limit = total.messages > MESSAGES ? "messages" : total.lines > LINES ? "lines" : undefined;
    if (limit === undefined) return undefined;
    // Each old message that ages out gives its share back: the wait is until the last one needed has.
    let wait = 0;
    for (const sent of held) {
      if (total.messages <= MESSAGES && total.lines <= LINES) break;
      total.messages -= sent.messages;
      total.lines -= sent.lines;
      wait = sent.at + MINUTE - now + 1;
    }
    return { limit, wait };
  }

  record(now: number, messages: number, lines: number): void {
    this.#sent = this.#sent.filter(({ at }) => at + MINUTE > now);
    this.#sent.push({ at: now, messages, lines });
  }
}
