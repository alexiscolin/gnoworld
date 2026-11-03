// Who listens to a record the components read through useSyncExternalStore: the scene's host and the views of space (7v), one way.

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
