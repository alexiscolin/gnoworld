// The passport (slice 8; ADR-0002 §1, Passport): a stamp per world visited, on the device, keyed "universe:world"; progress per
// constellation, a world counted once in the one it belongs to, and the header's counter out of the worlds the reader's own view lists
// (ADR-0002 §3, Alexis's answer 1 to slice 8's plan).

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

/** A constellation: a star system's worlds and how many of them are stamped. */
export interface Constellation {
  readonly id: string;
  readonly worlds: number;
  readonly stamped: number;
}

/** The constellations of the worlds listed, by their namespace, each world once: the started ones first, the most stamped share first, then
 * by name. A world stamped that the list does not hold yet (a new one) stands in its namespace too. */
export function constellationsOf(
  worlds: readonly { readonly id: string; readonly namespace: string }[],
  stamped: ReadonlySet<string>,
): Constellation[] {
  const held = new Map<string, Set<string>>();
  const add = (namespace: string, id: string) =>
    held.set(namespace, (held.get(namespace) ?? new Set<string>()).add(id));
  for (const { id, namespace } of worlds) add(namespace, id);
  const listed = new Set(worlds.map(({ id }) => id));
  for (const id of stamped) if (!listed.has(id)) add(id.split("/")[0] ?? id, id);
  return [...held]
    .map(([id, ids]) => ({ id, worlds: ids.size, stamped: [...ids].filter((world) => stamped.has(world)).length }))
    .sort((a, b) => b.stamped / b.worlds - a.stamped / a.worlds || b.stamped - a.stamped || a.id.localeCompare(b.id));
}

/** `held` with `key` marked on `day`, unless it was already: a second visit changes nothing (a stamp, a world charted). */
export const markFirst = (held: Readonly<Record<string, string>>, key: string, day: string): Record<string, string> =>
  Object.hasOwn(held, key) ? { ...held } : { ...held, [key]: day };
