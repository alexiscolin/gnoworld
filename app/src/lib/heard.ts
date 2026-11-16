// Who listens to a record the components read through useSyncExternalStore, one way: the scene's host, the views of space
// and the top centre's pill.

export class Heard {
  readonly #listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Tells every listener. */
  readonly tell = (): void => {
    for (const listener of this.#listeners) listener();
  };
}
