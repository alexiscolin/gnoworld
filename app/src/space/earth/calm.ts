// The calm of a planet's arrival (D13001): no aim and no ping before it is over, and no aim at all for a message said before the arrival.
// It starts when the page's planet first stands at rest on its page, and starts again each time a flight takes it away.
export class Calm {
  readonly #wait: number;
  readonly #now: () => number;
  #arrivedAt: number | undefined;
  #since = 0;
  readonly #told = new WeakSet<object>();

  /** `wait` seconds after the arrival; `now`, the clock a message's time (milliseconds) is held against. */
  constructor(wait: number, now: () => number) {
    this.#wait = wait;
    this.#now = now;
  }

  /** The planet stands at rest on its page, `step` seconds more. */
  rested(step: number): void {
    this.#arrivedAt ??= this.#now();
    this.#since += step;
  }

  /** The planet is away from its page: its arrival has not happened yet. */
  away(): void {
    this.#arrivedAt = undefined;
    this.#since = 0;
  }

  /** Whether the wait is over. */
  get over(): boolean {
    return this.#since >= this.#wait;
  }

  /** Whether a message said at `sent` (milliseconds; none, after) was said before the arrival. */
  before(sent: number | undefined): boolean {
    return sent !== undefined && this.#arrivedAt !== undefined && sent < this.#arrivedAt;
  }

  /** Whether `mark` is to be told the wait is over: once, and only once it is. */
  tell(mark: object): boolean {
    if (!this.over || this.#told.has(mark)) return false;
    this.#told.add(mark);
    return true;
  }
}
