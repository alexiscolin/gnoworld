// Whether the reader's scroll is going on, a finger on the list or its momentum after it (iOS keeps a flung list moving after the touch
// ends, and a write to `scrollTop` while it moves stops it). Its end is `scrollend` where the engine has it, else a quiet of QUIET_MS with
// no finger down. What a growth asks of the scroll meanwhile is owed, and settled once, at that end.

/** How long a list that scrolls no more, its reader's finger up, is quiet before its scroll is over, in ms. */
export const QUIET_MS = 150;

export class Fling {
  #moving = false;
  #touching = false;
  #owed = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  readonly #settle: (owed: number) => void;

  /** `settle` is called once a scroll, at its end, with the sum of what was owed (0 for none): the page notes its place again. */
  constructor(settle: (owed: number) => void) {
    this.#settle = settle;
  }

  /** Whether a scroll is going on: nothing is to be written to the list's scroll. */
  get moving(): boolean {
    return this.#moving;
  }

  /** The list scrolled. */
  scrolled(): void {
    this.#moving = true;
    this.#wait();
  }

  /** A finger went down on the list, or came up. */
  touching(down: boolean): void {
    this.#touching = down;
    if (down) this.#moving = true;
    this.#wait();
  }

  /** The engine says the scroll ended: it did, unless a finger is down. */
  ended(): void {
    if (!this.#touching) this.#end();
  }

  /** The scroll is to be moved by `px` once it is over. */
  owe(px: number): void {
    this.#owed += px;
  }

  /** Stops waiting: the page leaves. */
  stop(): void {
    clearTimeout(this.#timer);
  }

  // The end comes QUIET_MS after the last scroll or the finger's lifting, never while a finger is down.
  #wait(): void {
    clearTimeout(this.#timer);
    if (this.#touching) return;
    this.#timer = setTimeout(() => {
      this.#end();
    }, QUIET_MS);
  }

  #end(): void {
    clearTimeout(this.#timer);
    this.#moving = false;
    const owed = this.#owed;
    this.#owed = 0;
    this.#settle(owed);
  }
}
