// A part of the scene behind a chunk of its own, the cosmos or a world: its code comes when a page first asks, so a page that never does pays
// nothing, and a chunk that does not come leaves the scene as it is. The part is made once, owned with the rest, then told what was asked.
import type { Disposer } from "./disposer.ts";

export class Door<P extends { dispose(): void }> {
  readonly #load: () => Promise<() => P>;
  readonly #owner: Disposer;
  readonly #came: (part: P) => void;
  #part: P | undefined;
  #asked = false;

  constructor(load: () => Promise<() => P>, owner: Disposer, came: (part: P) => void) {
    this.#load = load;
    this.#owner = owner;
    this.#came = came;
  }

  /** The part, once it came. */
  get part(): P | undefined {
    return this.#part;
  }

  /** Asks for the part's chunk, once. */
  open(): void {
    if (this.#asked) return;
    this.#asked = true;
    this.#load().then(
      (make) => {
        if (this.#owner.signal.aborted) return;
        this.#part = this.#owner.add(make());
        this.#came(this.#part);
      },
      () => undefined,
    );
  }
}
