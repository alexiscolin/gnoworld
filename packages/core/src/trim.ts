// The one way a page bounds what it remembers, its scene too: an insertion-ordered Set or Map walks its oldest first, so trimming from
// that end keeps the newest. A key set again keeps its place.

interface Held<K> {
  readonly size: number;
  keys(): Iterable<K>;
  delete(key: K): boolean;
}

interface Trim<K> {
  /** Whether a key may go; one refused stays, and the next oldest is tried. */
  may?: (key: K) => boolean;
  /** Told each key just before it goes. */
  dropped?: (key: K) => void;
}

/** Drops the oldest keys of `held` until it holds `max` at most. */
export function trimOldest<K>(held: Held<K>, max: number, { may, dropped }: Trim<K> = {}): void {
  for (const key of held.keys()) {
    if (held.size <= max) return;
    if (may?.(key) === false) continue;
    dropped?.(key);
    held.delete(key);
  }
}
