// What the account tells Ergo besides its lines (slice 4's 4f), one connection's or one session's.

/** The least time between two of the account's actives to a room: IRCv3's typing spec throttles them to 3 s. */
const TYPING_EVERY_MS = 3_000;

/** Its typing (IRCv3's +typing, ircv3.net/specs/client-tags/typing), one connection's: an active at most once every
 * 3 s a room, a done only after an active; a line said, or a done, ends it, so the next active goes at once. */
export class TypingOut {
  // The rooms told an active, and when (the page's clock).
  readonly #typed = new Map<string, number>();

  /** Tells `room` this state through `send`, unless throttled or a done owed nothing. */
  tell(room: string, state: "active" | "done", send: (line: string) => boolean): void {
    const now = Date.now();
    const last = this.#typed.get(room);
    if (state === "done" ? last === undefined : last !== undefined && now - last < TYPING_EVERY_MS) return;
    if (!send(`@+typing=${state} TAGMSG ${room}`)) return;
    if (state === "done") this.#typed.delete(room);
    else this.#typed.set(room, now);
  }

  /** A line said in the room, or the room left: its typing ended at every reader. */
  ended(room: string): void {
    this.#typed.delete(room);
  }

  forget(): void {
    this.#typed.clear();
  }
}

/** The reading places it asks Ergo to keep (draft/read-marker): the time the page last asked each room read to, one
 * session's, and the time sent on this connection; a place goes once past both Ergo's and what was sent, so a
 * MARKREAD lost with a connection goes again on the next, and one answered never twice. */
export class Places {
  readonly #asked = new Map<string, string>();
  readonly #sent = new Map<string, string>();

  /** The page read `room` to the line of this time. */
  ask(room: string, time: string): void {
    const asked = this.#asked.get(room);
    if (asked === undefined || time > asked) this.#asked.set(room, time);
  }

  /** Sends `room`'s MARKREAD through `send` when the place asked is past Ergo's, `held`, and what was sent. */
  tell(room: string, held: string | undefined, send: (line: string) => boolean): void {
    const time = this.#asked.get(room);
    const sent = this.#sent.get(room);
    if (time === undefined || [held, sent].some((each) => each !== undefined && each >= time)) return;
    if (send(`MARKREAD ${room} timestamp=${time}`)) this.#sent.set(room, time);
  }

  /** A new connection: nothing sent on it yet. */
  reconnected(): void {
    this.#sent.clear();
  }

  /** Another session: nothing asked for it. */
  forget(): void {
    this.#asked.clear();
    this.#sent.clear();
  }
}
