// The passport (ADR-0002 §1, Passport): a stamp per world visited, on the device, keyed "universe:world"; progress per
// constellation, a world counted once in the one it belongs to, and the header's counter out of the worlds the reader's own view lists
// (ADR-0002 §3).

/** The device's key of world `world` of `universe`. */
export const stampKey = (universe: string, world: string): string => `${universe}:${world}`;

/** The worlds of `universe` the stamps hold, each once. */
export function stampedIn(stamps: Readonly<Record<string, string>>, universe: string): Set<string> {
  const prefix = stampKey(universe, "");
  return new Set(
    Object.keys(stamps)
      .filter((key) => key.startsWith(prefix) && key.length > prefix.length)
      .map((key) => key.slice(prefix.length)),
  );
}

/** The header's counter: the worlds stamped out of the worlds listed, the stamped ones never more than the listed; none before the list
 * is known. */
export function passportCount(
  stamped: number,
  listed: number | undefined,
): { stamped: number; listed: number } | undefined {
  if (listed === undefined) return undefined;
  const shown = Math.max(listed, stamped);
  return { stamped: Math.min(stamped, shown), listed: shown };
}

/** `held` with `key` marked on `day`, unless it was already: a second visit changes nothing (a stamp, a world charted). */
export const markFirst = (held: Readonly<Record<string, string>>, key: string, day: string): Record<string, string> =>
  Object.hasOwn(held, key) ? { ...held } : { ...held, [key]: day };
