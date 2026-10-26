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

/** The least time between two MARKREADs of one room: each spends Ergo's fakelag once its budget of 16 is gone
 * (deploy/ergo/ircd.yaml.tmpl), so a busy room read at its end would queue the account's own lines behind them (F940). */
const MARK_EVERY_MS = 2_000;

/** The reading places it asks Ergo to keep (draft/read-marker), one session's: a place goes once past Ergo's and what
 * was sent on this connection, so a MARKREAD lost with a connection goes again on the next and one answered never
 * twice; at most one a room each 2 s, the newest place following. */
export class Places {
  readonly #asked = new Map<string, string>();
  readonly #sent = new Map<string, string>();
  // When each room's last MARKREAD went on this connection (the page's clock), and the send waiting to follow it.
  readonly #at = new Map<string, number>();
  readonly #waiting = new Map<string, ReturnType<typeof setTimeout>>();

  readonly #held: (room: string) => string | undefined;
  readonly #send: (line: string) => boolean;

  /** `held`: Ergo's place for a room as the store holds it now; `send`: the way out to Ergo. */
  constructor(held: (room: string) => string | undefined, send: (line: string) => boolean) {
    this.#held = held;
    this.#send = send;
  }

  /** The page read `room` to the line of this time. */
  ask(room: string, time: string): void {
    const asked = this.#asked.get(room);
    if (asked === undefined || time > asked) this.#asked.set(room, time);
  }

  /** Sends `room`'s MARKREAD when the place asked is past Ergo's and what was sent: at once when `now` or 2 s after
   * the last, else once they are. */
  tell(room: string, now = false): void {
    const time = this.#asked.get(room);
    const sent = this.#sent.get(room);
    if (time === undefined || [this.#held(room), sent].some((each) => each !== undefined && each >= time)) return;
    const wait = (this.#at.get(room) ?? -Infinity) + MARK_EVERY_MS - Date.now();
    if (!now && wait > 0) {
      if (!this.#waiting.has(room)) {
        const later = () => {
          this.tell(room, true);
        };
        this.#waiting.set(room, setTimeout(later, wait));
      }
      return;
    }
    this.#stop(room);
    if (!this.#send(`MARKREAD ${room} timestamp=${time}`)) return;
    this.#sent.set(room, time);
    this.#at.set(room, Date.now());
  }

  /** Sends at once the places waiting: `room`'s, or every room's. */
  flush(room?: string): void {
    for (const each of [...this.#waiting.keys()]) if (room === undefined || each === room) this.tell(each, true);
  }

  #stop(room: string): void {
    clearTimeout(this.#waiting.get(room));
    this.#waiting.delete(room);
  }

  /** A new connection: nothing sent on it yet, nothing waiting. */
  reconnected(): void {
    for (const room of [...this.#waiting.keys()]) this.#stop(room);
    this.#sent.clear();
    this.#at.clear();
  }

  /** Another session: nothing asked for it. */
  forget(): void {
    this.reconnected();
    this.#asked.clear();
  }
}
