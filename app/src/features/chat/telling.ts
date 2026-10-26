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
