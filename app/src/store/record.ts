// Small forms of the records the store keeps by an id the relay, Ergo or the device gives: any word, `__proto__` among
// them, so a key is read as an own entry alone.

/** The record's own entry at `key`; none for a key it does not hold itself. */
export const own = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;
