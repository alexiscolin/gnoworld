// Which planets are drawn as themselves: the few largest on screen.
import { placeOf, type Planet, type Universe, type Vec } from "../layout.ts";

// A planet this many pixels across, or more, is drawn as itself; one this many has its maps asked ahead (warm.ts), and, in the open system,
// is made, uploaded and compiled ahead too: it is seen as itself soon, and never waits on screen as its skeleton.
const FROM_PX = 6;
const WARM_PX = 2;

/** At most this many at once. */
const MOST = 10;

/** Keeps `planet`, `px` across, among the MOST largest, largest first, in the same two lists each time. */
function keepLargest<T>({ wanted, sizes }: { wanted: T[]; sizes: number[] }, planet: T, px: number): void {
  let at = wanted.length;
  while (at > 0 && (sizes[at - 1] ?? Infinity) < px) at -= 1;
  if (at >= MOST) return;
  if (wanted.length < MOST) {
    wanted.push(planet);
    sizes.push(px);
  }
  wanted.copyWithin(at + 1, at, wanted.length - 1);
  sizes.copyWithin(at + 1, at, sizes.length - 1);
  wanted[at] = planet;
  sizes[at] = px;
}

// A planet too small yet to be drawn as itself: its maps asked, and, in the open system, itself made ahead.
function askAhead(
  planet: Planet,
  { drawn, ahead, warm }: { drawn: boolean; ahead: Planet[]; warm: { planet(planet: Planet): void } },
): void {
  warm.planet(planet);
  if (drawn) ahead.push(planet);
}

const AT: Vec = { x: 0, y: 0, z: 0 };

/** Fills `wanted` and `sizes` with the planets of `universe` drawn as themselves from `eye`, `pxK` world units a pixel at distance 1; with
 * `open`, only that system's (-1: none), the others' being asked ahead of `warm`, never drawn. `ahead` gets the open system's planets too
 * small to be drawn as themselves yet, which are made ahead. */
export function sight(
  universe: Universe,
  { eye, pxK, seconds, open }: { eye: Vec; pxK: number; seconds: number; open?: number | undefined },
  {
    wanted,
    sizes,
    ahead,
    warm,
  }: { wanted: Planet[]; sizes: number[]; ahead: Planet[]; warm: { planet(planet: Planet): void } },
): void {
  wanted.length = sizes.length = ahead.length = 0;
  for (const system of universe.systems) {
    const { x, y, z } = system.place;
    if (Math.hypot(x - eye.x, y - eye.y, z - eye.z) > system.reach * 40) continue;
    const drawn = system.index === (open ?? system.index);
    for (const planet of system.planets) {
      placeOf(planet, seconds, AT);
      const px = (2 * planet.radius) / (Math.hypot(AT.x - eye.x, AT.y - eye.y, AT.z - eye.z) * pxK);
      if (px >= FROM_PX && drawn) keepLargest({ wanted, sizes }, planet, px);
      else if (px >= WARM_PX) askAhead(planet, { drawn, ahead, warm });
    }
  }
}
