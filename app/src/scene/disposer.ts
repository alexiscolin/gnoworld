// One owner per part (ADR-0002 §9, memory): what a part creates goes in here, and leaving disposes it, listeners through the signal.

interface Owned {
  dispose(): void;
}

export class Disposer {
  readonly #leaving = new AbortController();
  #owned: Owned[] = [];

  /** Listeners take this, and go with the rest. */
  get signal(): AbortSignal {
    return this.#leaving.signal;
  }

  /** Owns `resource`, disposing it at once if the part has already left: what was still loading then. */
  add<T extends Owned>(resource: T): T {
    if (this.signal.aborted) resource.dispose();
    else this.#owned.push(resource);
    return resource;
  }

  /** Disposes everything, last made first; one that fails stops none of the rest, and is raised after them. */
  dispose(): void {
    this.#leaving.abort();
    const failed: unknown[] = [];
    for (const resource of this.#owned.reverse()) {
      try {
        resource.dispose();
      } catch (error) {
        failed.push(error);
      }
    }
    this.#owned = [];
    if (failed.length > 0) throw failed[0];
  }
}
