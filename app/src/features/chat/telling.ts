// What the account tells Ergo besides its lines (slice 4's 4f), one connection's or one session's.

/** The least time between two of a room's typing TAGMSGs: IRCv3's typing spec throttles them to 3 s; a done counts
 * too, or a field cleared and written again would send two a cycle (CR5). */
const TYPING_EVERY_MS = 3_000;

/** Its typing (IRCv3's +typing, ircv3.net/specs/client-tags/typing), one connection's: one TAGMSG at most each 3 s a
 * room, a done only after an active, waiting its turn; a line said ends the typing, so the next active goes at once. */
export class TypingOut {
  // Each room's last TAGMSG (the page's clock, its state), and the done waiting its turn.
  readonly #told = new Map<string, { at: number; state: "active" | "done" }>();
  readonly #waiting = new Map<string, ReturnType<typeof setTimeout>>();

  /** Tells `room` this state through `send`, at once or, a done, once its turn comes; nothing a done does not owe. */
  tell(room: string, state: "active" | "done", send: (line: string) => boolean): void {
    const last = this.#told.get(room);
    this.#stop(room);
    if (state === "done" && last?.state !== "active") return;
    const wait = last === undefined ? 0 : last.at + TYPING_EVERY_MS - Date.now();
    if (wait > 0) {
      if (state === "done") {
        const later = () => {
          this.tell(room, "done", send);
        };
        this.#waiting.set(room, setTimeout(later, wait));
      }
      return;
    }
    if (send(`@+typing=${state} TAGMSG ${room}`)) this.#told.set(room, { at: Date.now(), state });
  }

  /** A line said in the room, or the room left: its typing ended at every reader. */
  ended(room: string): void {
    this.#stop(room);
    this.#told.delete(room);
  }

  #stop(room: string): void {
    clearTimeout(this.#waiting.get(room));
    this.#waiting.delete(room);
  }

  forget(): void {
    for (const room of [...this.#waiting.keys()]) this.#stop(room);
    this.#told.clear();
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
