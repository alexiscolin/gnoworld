// The planets one Near holds go on into the next, whole, when the universe is laid out anew with a world more (near.ts, stage.ts): their
// state, fades and turn with them under their new index; those the new universe lacks stay with `from`, which drops them as it goes.
import { SphereGeometry } from "three";
import type { Universe } from "../layout.ts";
import type { Held } from "./held.ts";

/** One sphere for every planet drawn as itself, of every Near: the planets one Near hands the next keep it. */
export const SPHERE = new SphereGeometry(1, 128, 96);

interface Planets {
  show(index: number, shown: boolean): void;
}

export interface Kept {
  readonly held: Map<number, Held>;
  readonly hidden: Set<number>;
  readonly once: Set<number>;
  readonly led: Map<string, { ahead: number; leaned: unknown }>;
}

/** Moves what `from` keeps into `to`, each planet to its index in `now` (none: it goes). */
export function adopt(
  from: Kept,
  to: Kept,
  { before, now, planets }: { before: Universe; now: Universe; planets: Planets },
): void {
  const indexOf = (index: number) => now.byId.get(before.planets[index]?.id ?? "")?.index;
  for (const [index, held] of from.held) {
    const at = indexOf(index);
    if (at === undefined) continue;
    held.planet = now.planets[at] ?? held.planet;
    to.held.set(at, held);
    planets.show(at, !held.shown || held.over);
    if (from.hidden.has(index)) to.hidden.add(at);
    if (from.once.has(index)) to.once.add(at);
    from.held.delete(index);
  }
  for (const [id, led] of from.led) to.led.set(id, led);
}
