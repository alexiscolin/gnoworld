// What is under a point of the screen (D401, the demo's pick): a planet once its system is large enough to tell them apart, else the
// system; within a fingertip's reach of what it aims at. Read at an event, never on a frame.
import { placeOf, type Planet, type System, type Universe } from "./layout.ts";
import type { Seen } from "./see.ts";
import type { Place } from "./place.ts";

export type Hit = { readonly planet: Planet } | { readonly system: System };

// raw: how wide a planet stands on screen, in pixels across its radius, before a wheel over it in the Map dives into it (D498)
const DIVE_PX = 26;

// Whether `planet` stands large enough on screen, as `seen`, `seconds` on, for a wheel over it to dive in from the Map.
const nearEnough = (planet: Planet, seen: Seen, seconds: number): boolean =>
  seen.pixels(placeOf(planet, seconds, { x: 0, y: 0, z: 0 }), planet.radius) > DIVE_PX;

interface Diving {
  readonly place: Place | undefined;
  readonly planet: Planet | undefined;
  readonly plan: boolean;
  readonly see: Seen;
  readonly seconds: number;
}

/** Whether a wheel in over `hit` dives there: a planet of a system, not the page's own; from the Map once it stands large (D498). */
export const divesInto = (hit: Hit, { place, planet, plan, see, seconds }: Diving): boolean =>
  "planet" in hit &&
  place?.kind !== "universe" &&
  planet !== hit.planet &&
  (!plan || nearEnough(hit.planet, see, seconds));

/** What a name stands for, as a hit. */
export const hitOf = (item: Planet | System): Hit => ("system" in item ? { planet: item } : { system: item });

const REACH = 14;
const SYSTEM_REACH = 16;
// A system this many pixels across shows its planets apart: a click aims at them.
const APART_PX = 70;

interface Aim {
  readonly x: number;
  readonly y: number;
  readonly seen: Seen;
  readonly seconds: number;
  /** The worlds a tag lights (D425): the others answer no aim; none, every world does. */
  readonly only?: ReadonlySet<string> | undefined;
  /** The system whose planets are drawn: the others' answer no aim. */
  readonly open: System | undefined;
}

// The planet of `system` nearest the aim on screen within its reach, and how far off it is.
function planetAt(system: System, aim: Aim): { hit: Hit; off: number } | undefined {
  if (system !== aim.open) return undefined;
  const [at, on] = [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
  ];
  let found: { hit: Hit; off: number } | undefined;
  for (const planet of system.planets) {
    if (aim.only?.has(planet.id) === false || !aim.seen.project(placeOf(planet, aim.seconds, at), on)) continue;
    const off = Math.hypot(on.x - aim.x, on.y - aim.y);
    const reach = Math.max(REACH, aim.seen.pixels(at, planet.radius) + 6);
    if (off < reach && off < (found?.off ?? Infinity)) found = { hit: { planet }, off };
  }
  return found;
}

// `system` itself, its sun, if the aim falls within its reach, and how far off.
function systemAt(system: System, aim: Aim, across: number): { hit: Hit; off: number } | undefined {
  const on = { x: 0, y: 0, z: 0 };
  if (!aim.seen.project(system.place, on)) return undefined;
  const off = Math.hypot(on.x - aim.x, on.y - aim.y);
  const sun = aim.seen.pixels(system.place, system.core * 3);
  const reach = Math.max(SYSTEM_REACH, across > APART_PX ? sun : across * 0.8);
  return off < reach ? { hit: { system }, off } : undefined;
}

// Whether a tag lights a world of `system` (none: every system shines): a system it dims answers no aim, nor its planets.
const shines = (system: System, only: ReadonlySet<string> | undefined) =>
  only === undefined || system.planets.some(({ id }) => only.has(id));

/** What is under the screen's point `x`, `y`, as `seen`, `seconds` on: a planet wins over its system's sun. */
export function pickAt(
  universe: Universe,
  { x, y }: { x: number; y: number },
  {
    seen,
    seconds,
    only,
    open,
  }: { seen: Seen; seconds: number; only?: ReadonlySet<string> | undefined; open: System | undefined },
): Hit | undefined {
  const aim: Aim = { x, y, seen, seconds, only, open };
  let best: { hit: Hit; off: number } | undefined;
  for (const system of universe.systems) {
    if (!shines(system, only)) continue;
    const across = seen.pixels(system.place, system.reach);
    const planet = across > APART_PX ? planetAt(system, aim) : undefined;
    const found = planet === undefined ? systemAt(system, aim, across) : { hit: planet.hit, off: planet.off - 1000 };
    if (found !== undefined && found.off < (best?.off ?? Infinity)) best = found;
  }
  return best?.hit;
}
