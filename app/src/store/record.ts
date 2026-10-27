// Small forms of the records the store keeps by an id the relay, Ergo or the device gives: any word, `__proto__` among
// them, so a key is read as an own entry alone.

/** The record's own entry at `key`; none for a key it does not hold itself. */
export const own = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

/** The record without `key`. */
export const without = <T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> =>
  Object.fromEntries(Object.entries(record).filter(([each]) => each !== key));

/** The record with the entry `[key, value]` put last, the first dropped past `kept` entries: the key set longest ago
 * goes first. */
export const lastKept = <T>(
  record: Readonly<Record<string, T>>,
  [key, value]: readonly [string, T],
  kept: number,
): Record<string, T> => {
  const entries: [string, T][] = [...Object.entries(without(record, key)), [key, value]];
  return Object.fromEntries(entries.slice(-kept));
};
