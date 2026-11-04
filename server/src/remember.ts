// A Map held to a size (ADR-0002 §7: every map has a cap): an entry set again goes last, and past the cap the entries set
// longest ago go first.

/** Sets `entry` last in `map`, then drops the entries set longest ago until `max` are left. */
export function remember<K, V>(map: Map<K, V>, [key, value]: readonly [K, V], max: number): void {
  map.delete(key);
  map.set(key, value);
  for (const old of map.keys()) {
    if (map.size <= max) break;
    map.delete(old);
  }
}
