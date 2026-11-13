// Where the stations stand round the Earth (part 7x): the largest first, by the size the team's file gives each, then in the file's order,
// never by chance. The first twelve each take, of the places on their own orbits that the Earth's view reads clear (whole on the screen,
// off the page's text, the Earth, the great star, the rail and the Moon's whole path, in no crowd, pile or row: 7p's judge), the one
// farthest from those standing already (the best candidate, D349), so a list spreads again as it changes; others light a far belt.
import { EARTH_PLACE, EARTH_RADIUS } from "../cosmos/system.ts";
import type { Point } from "../space/cell.ts";
import { Draws } from "./draws.ts";
import { clamp01 } from "../space/smooth.ts";
import { composed } from "../frame/composition.ts";
import { offMoon, type MoonRing } from "../frame/earthMoon.ts";
import { Look, looksFrom, type Seen } from "../frame/restLook.ts";
import { earthCamera, sceneryOf } from "./scenery.ts";

/** A station as the file asks it: its seed (its name) and its size, 0 to 1. */
interface Asked {
  readonly seed: string;
  readonly size: number;
}

/** A station placed: its orbit round the Earth (reach in world units, lean and node in radians) and its place on it, its reach there. */
export interface Placed extends Asked {
  readonly orbit: { readonly reach: number; readonly tilt: number; readonly node: number };
  readonly place: Point;
  readonly radius: number;
}

/** The Earth's stations: those standing as bodies, and the rest as lights in the belt. */
interface Round {
  readonly close: readonly Placed[];
  readonly belt: readonly Placed[];
}

const CLOSE_MOST = 12;
const TRIES = 48;
const MARGIN = 24;
// Room for a label over a station, and the rail's band at the screen's right, in pixels.
const LABEL = 34;
const RAIL = 160;
const [SMALLEST, LARGEST] = [0.5, 1.15];
// A phone's screen, where a station stands whole with its label, or off it.
const PHONE = { width: 390, height: 844 };

/** A station's reach for its size, in world units: a satellite two fifths of the Earth's, an artificial world nearly the Earth's. */
const radiusOf = (size: number): number => SMALLEST + (LARGEST - SMALLEST) * clamp01(size);

/** A place on an orbit: `reach` out, leaning `tilt` off the disc round the line at `node`, `phase` round it, on the map. */
export function onOrbit({ reach, tilt, node }: Placed["orbit"], phase: number): Point {
  const [x, z] = [reach * Math.cos(phase), reach * Math.sin(phase)];
  const [y, flat] = [z * Math.sin(tilt), z * Math.cos(tilt)];
  return {
    x: EARTH_PLACE.x + x * Math.cos(node) - flat * Math.sin(node),
    y: EARTH_PLACE.y + y,
    z: EARTH_PLACE.z + x * Math.sin(node) + flat * Math.cos(node),
  };
}

// The place `key`'s draws give `asked`: its orbit `near` to `far` Earth radii out, leaning up to `lean`, its node and phase anywhere.
function drawn(asked: Asked, key: string, { near, far, lean }: { near: number; far: number; lean: number }): Placed {
  const draws = new Draws(key);
  const draw = (): number => draws.unit();
  const orbit = {
    reach: (near + (far - near) * draw()) * EARTH_RADIUS,
    tilt: (draw() - 0.5) * lean,
    node: draw() * 2 * Math.PI,
  };
  return { ...asked, orbit, place: onOrbit(orbit, draw() * 2 * Math.PI), radius: radiusOf(asked.size) };
}

// The `try`th place of `asked`: 2.8 to 8 Earth radii out, leaning; the nearest the Earth is tried first.
const triedAt = (asked: Asked, tried: number): Placed =>
  drawn(asked, `round ${asked.seed} ${String(tried)}`, { near: 2.8, far: 8, lean: 2.2 });

// Whether a station `seen` on `look` stands clear of all that stands there, `spots`, and of the scenery's planets, `scenery`.
function clearOn(look: Look, seen: Seen, { spots, scenery, ring }: Standing): boolean {
  const { earth, width, height } = look;
  const path = Array.from({ length: 24 }, (_, at) => ({ ...ring, rest: (at * Math.PI) / 12 }));
  return (
    look.whole(seen, MARGIN) &&
    seen.top >= LABEL + MARGIN &&
    seen.x + seen.radius < width - RAIL &&
    look.clear(seen, MARGIN) &&
    Math.hypot(seen.x - earth.x, seen.y - earth.y) - seen.radius - earth.radius >= 0.4 * earth.radius + MARGIN &&
    path.every((moon) => offMoon(look, [seen], moon)) &&
    [...spots, ...scenery].every(
      (other) => Math.hypot(seen.x - other.x, seen.y - other.y) - seen.radius - other.radius >= LABEL,
    ) &&
    composed([...spots, seen], earth, { deep: false, lights: [look.star], width, height })
  );
}

// What stands on a screen: the stations placed, and the scenery's planets, Saturn with its ring.
interface Standing {
  readonly spots: Seen[];
  readonly scenery: readonly Seen[];
  readonly ring: MoonRing;
}

// On a phone a station stands whole, its label over it, off the Earth, or not at all.
function phoneHolds(phone: Look, seen: Seen): boolean {
  const { earth } = phone;
  const whole = seen.left >= 0 && seen.right <= phone.width && seen.top >= LABEL && seen.bottom <= phone.height;
  const offEarth = Math.hypot(seen.x - earth.x, seen.y - earth.y) - seen.radius - earth.radius >= MARGIN;
  return phone.off({ ...seen, top: seen.top - LABEL }) || (whole && offEarth);
}

// The belt's place of a station that stands no body: 10 to 15 Earth radii out, near the disc.
const inBelt = (asked: Asked): Placed => drawn(asked, `belt ${asked.seed}`, { near: 10, far: 15, lean: 0.12 });

// Of `clear`, nearest the Earth first, the one whose gap to the nearest of `spots` on `look` is the widest; the nearest itself with none.
function farthest(clear: readonly Placed[], look: Look | undefined, spots: readonly Seen[]): Placed | undefined {
  if (look === undefined || spots.length === 0) return clear[0];
  let [best, widest] = [clear[0], -Infinity];
  for (const placed of clear) {
    const seen = look.ball(placed.place, placed.radius);
    const gap = Math.min(
      ...spots.map((other) => Math.hypot(seen.x - other.x, seen.y - other.y) - seen.radius - other.radius),
    );
    if (gap > widest) [best, widest] = [placed, gap];
  }
  return best;
}

/** The stations `asked` round the Earth, judged on the video's screens through the Earth's view at rest; `ring` the small Earth's Moon's. */
export function stationsRound(asked: readonly Asked[], ring: MoonRing): Round {
  const camera = earthCamera();
  const looks = looksFrom(camera);
  const phone = new Look(camera, PHONE);
  const planets = sceneryOf();
  const standing: Standing[] = looks.map((look) => ({
    spots: [],
    scenery: planets.map(({ place, radius, ring: rings }) => look.ball(place, radius * (rings?.outer ?? 1))),
    ring,
  }));
  const order = asked
    .map((one, index) => ({ one, index }))
    .sort((a, b) => b.one.size - a.one.size || a.index - b.index);
  const close: Placed[] = [];
  const belt: Placed[] = [];
  for (const { one } of order) {
    const clear =
      close.length < CLOSE_MOST
        ? Array.from({ length: TRIES }, (_, tried) => triedAt(one, tried))
            .sort((a, b) => a.orbit.reach - b.orbit.reach)
            .filter(
              (placed) =>
                phoneHolds(phone, phone.ball(placed.place, placed.radius)) &&
                looks.every((look, at) => {
                  const stood = standing[at];
                  return stood !== undefined && clearOn(look, look.ball(placed.place, placed.radius), stood);
                }),
            )
        : [];
    const found = farthest(clear, looks[0], standing[0]?.spots ?? []);
    if (found === undefined) {
      belt.push(inBelt(one));
      continue;
    }
    looks.forEach((look, at) => standing[at]?.spots.push(look.ball(found.place, found.radius)));
    close.push(found);
  }
  return { close, belt };
}
