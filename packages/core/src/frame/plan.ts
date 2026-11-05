// A system's Plan (part 7v; Alexis, 2026-11-03), seen from above its plane: the only view that draws its orbits, as ellipses, to pick a
// world more simply. Its star at the screen's centre, each world of a body's size on an orbit of its own, in the order of its real one but
// spread so each stands clear with room for its name under it, at a size that keeps their order; whole on both screens, none on the star's
// heart. Its worlds hold still. The address picks the turn the views are tried from, so the same address gives the same Plan. The Earth's
// top view is its stations' (station/scenery.ts).
import { GRAIN, WORLD_LEAST, WORLD_MOST, type Orbiter, type StarSystem } from "../cosmos/system.ts";
import { textHash, unitOf } from "../space/cell.ts";
import { LEAN } from "../space/drift.ts";
import type { Arrival } from "./arrival.ts";
import { onPlane, orbitPlace } from "./disc.ts";
import type { Planned } from "../lod/drawn.ts";
import { boxOf, MARGIN, meet, namedIn } from "./planNames.ts";
import { along, cameraTowards, DEGREE, focalOf, looksFrom, placeOf, REST_SCREENS, STAR_HEART } from "./restLook.ts";

/** The most worlds a Plan draws, the largest first: past them its others are dust. */
const PLAN_MOST = 12;
// A Plan's own lens, in degrees (the chief, 2026-11-04): a chart, its orbits round their star, where the home's 42.5 degrees put the outer
// ellipse's centre 122 px under it; the offset falls with the lens's tangent, 17 px here at the video's screen (7v's design review, F4470).
const PLAN_LENS = 7;
// A mouse leans a Plan's eye half the home's, as an arrival leaned before a system's dynamic view leaned less (7v's design review, F4468).
const PLAN_LEAN = LEAN / 2;
// Seen 30 degrees over the plane: its orbits read as ellipses half as high as wide, the mock-up's.
const SLANT = 30 * DEGREE;
const TURNS = 24;
// Its outer orbit spans this share of the narrower screen's width; its largest world this share of that orbit.
const SPAN = 0.78;
const LARGEST = 0.14;
// The inner orbit, as a share of the outer one, and the least gap between two, in their worlds' radii: a disc's width and air, so which
// ring a world is on reads (the design review's second pass, F4470); the gaps growing an eighth a ring outward, the mock-up's 130 to 180 px.
const INNER = 0.24;
const GAP = 2.2;
const GROW = 1.12;
// At most this many orbits a Plan draws, the mock-up's five: its worlds share them, nearest the star first, so a Plan of any size reads as a
// few rings, never one ring a world at like gaps (7v's open 6, the planetarium's tell), nor thousands of lines (Alexis, 2026-11-04, scale).
const RINGS_MOST = 5;
// A world's radius, its share of the most used world's own size to this power: worldSize's whole span stands 3.5 times apart, the mock-up's 26
// to 92 px (7v's open 6: gnoswap's twelve stood within 1.4 times of one size); worlds of one use stand one size.
const SIZE_POWER = Math.log(3.5) / Math.log(WORLD_MOST / WORLD_LEAST);
// Worlds sharing a ring stand this share of an even share of the turn apart at the least: nudged from their own phases, never laid evenly.
const APART = 0.6;
const TURN = 2 * Math.PI;
// The sizes tried, from the largest down, a tenth smaller each time.
const LEAST = 0.02;
const SHRINK = 0.9;
const NEAR_BEST = 0.8;

// A world's own size, its use's, before its system's room caps it (7v's design review, F4470: gnoswap's 16 stood at their crowd's cap).
const sizeOf = ({ radius, own }: Orbiter) => own ?? radius;

/** The worlds a Plan of `system` draws: its bodies, the largest `PLAN_MOST` by their own size, in the order of their orbits, nearest the
 * star first. */
const planWorlds = (system: StarSystem): Orbiter[] =>
  system.worlds
    .filter(({ radius }) => radius >= GRAIN)
    .sort((a, b) => sizeOf(b) - sizeOf(a))
    .slice(0, PLAN_MOST)
    .sort((a, b) => a.orbit - b.orbit);

// `worlds` in the order of their orbits as bands, a ring each: `RINGS_MOST` runs at the most, each holding worlds as its ring's length, from
// the inner orbit's share to the outer's (an inner ring holds fewer, so its worlds' names keep apart), one at the least.
function bandsOf(worlds: readonly Orbiter[]): Orbiter[][] {
  const count = Math.min(worlds.length, RINGS_MOST);
  const length = (at: number) => (count === 1 ? 1 : INNER + ((1 - INNER) * at) / (count - 1));
  const whole = Array.from({ length: count }, (_, at) => length(at)).reduce((sum, each) => sum + each, 0);
  const bands: Orbiter[][] = [];
  let [from, shared] = [0, 0];
  for (let at = 0; at < count; at += 1) {
    shared += length(at);
    const to = Math.max(
      from + 1,
      Math.min(worlds.length - (count - at - 1), Math.round((shared / whole) * worlds.length)),
    );
    bands.push(worlds.slice(from, to));
    from = to;
  }
  return bands;
}

// The phases of one ring's worlds, from their own, nudged apart a step at a time till each stands `APART` of an even share from the next.
function apart(phases: readonly number[]): number[] {
  const turned = phases.map((phase) => ((phase % TURN) + TURN) % TURN);
  const least = (APART * TURN) / phases.length;
  const order = turned.map((_, at) => at).sort((a, b) => (turned[a] ?? 0) - (turned[b] ?? 0));
  for (let pass = 0; pass < 24 && order.length > 1; pass += 1)
    order.forEach((at, step) => {
      const next = order[(step + 1) % order.length] ?? at;
      const short = least - (((((turned[next] ?? 0) - (turned[at] ?? 0)) % TURN) + TURN) % TURN);
      if (short <= 0) return;
      turned[at] = (turned[at] ?? 0) - short / 2;
      turned[next] = (turned[next] ?? 0) + short / 2;
    });
  return turned;
}

// The Plan's orbits, outer at 1 or past: each band at its worlds' real orbits' share as the area they round (a lattice's slots are laid by
// area), on a scale whose steps grow `GROW` a ring outward as the mock-up's; or past the one before by the names' room, `GAP` of their radii
// growing `GROW` a ring: never evenly (F4470). The most used world `size` of the outer orbit, each other by its own size to `SIZE_POWER`.
function spread(worlds: readonly Orbiter[], size: number): Orbiter[] {
  const bands = bandsOf(worlds);
  const area = (band: readonly Orbiter[]) => band.reduce((sum, { orbit }) => sum + orbit ** 2, 0) / band.length;
  const inner = area(bands[0] ?? []);
  const span = Math.max(area(bands.at(-1) ?? []) - inner, 1e-9);
  const scale = GROW ** Math.max(bands.length - 1, 1);
  const most = Math.max(...worlds.map(sizeOf));
  const radiusOf = (world: Orbiter) => size * (sizeOf(world) / most) ** SIZE_POWER;
  const placed: Orbiter[] = [];
  let [least, before] = [0, { orbit: INNER, radius: 0 }];
  for (const band of bands) {
    const radius = Math.max(...band.map(radiusOf));
    const share = (scale ** ((area(band) - inner) / span) - 1) / (scale - 1);
    least = placed.length === 0 ? 0 : Math.max(GAP * Math.max(before.radius, radius), GROW * least);
    const orbit = Math.max(INNER + share * (1 - INNER), before.orbit + least);
    const phases = apart(band.map(({ phase }) => phase));
    band.forEach((world, at) => placed.push({ id: world.id, phase: phases[at] ?? 0, radius: radiusOf(world), orbit }));
    before = { orbit, radius };
  }
  return placed;
}

// The Plan's worlds `size` of its outer orbit at the most used's size, its inner orbit kept and its outer at 1: what lies between drawn
// in, its gaps and worlds alike, so a spread past 1 brings none nearer the star's heart.
function planOrbits(worlds: readonly Orbiter[], size: number): Orbiter[] {
  const placed = spread(worlds, size);
  const outer = Math.max(placed.at(-1)?.orbit ?? 1, 1);
  const scale = (1 - INNER) / (outer - INNER);
  return placed.map((world) => ({
    ...world,
    orbit: INNER + (world.orbit - INNER) * scale,
    radius: world.radius * scale,
  }));
}

/** Whether each world stands whole with its name's room under it, `heart` pixels or more off the centre's own (a star's, the Earth's disc),
 * and no two worlds or names meet, on every screen. */
function readable(
  { system, worlds }: { readonly system: StarSystem; readonly worlds: readonly Orbiter[] },
  camera: ReturnType<typeof cameraTowards>,
  heart = STAR_HEART,
): boolean {
  return looksFrom(camera, PLAN_LENS).every((look) => {
    const star = look.seen(system.place);
    const spots = worlds.map((world) => look.seen(placeOf(system, world, 0), world.radius));
    const boxes = spots.map((spot) => ({ ...boxOf(spot), depth: spot.depth }));
    return (
      spots.every(({ x, y, radius }) => Math.hypot(x - star.x, y - star.y) - radius >= heart) &&
      boxes.every((box) => look.whole(box, MARGIN)) &&
      boxes.every((box, at) => boxes.slice(at + 1).every((other) => !meet(box, other)))
    );
  });
}

/** A Plan: its view, and the worlds it names (F5462). */
export interface Plan extends Arrival {
  readonly named: ReadonlySet<string>;
}

/** `system`'s Plan: the eye over its plane at a slant, far enough that its outer orbit spans most of the narrower screen, at the first turn
 * from its address's whose largest size that stands every world readable is within a fifth of the best turn's; its first turn at the least
 * size if none does. Its postcard holds the Plan's worlds, still, and leaves out every other. */
export function planOf(system: StarSystem): Plan {
  const still = { ...system, spin: 0 };
  const worlds = planWorlds(system);
  const [screen] = REST_SCREENS;
  // The eye's distance in units of the outer orbit, then the orbits in the system's units: the Plan stands in its system's room.
  const room = Math.max(...system.worlds.map(({ orbit }) => orbit), 1);
  const distance = (focalOf(screen.height, PLAN_LENS) * (1 + LARGEST) * room) / ((SPAN / 2) * screen.width);
  // Its plane kept level: the camera's up is the plane's own normal, so no tilt of the system rolls its orbits on the screen; read off the
  // plane here, for the depth's module would split out of the view at rest's chunk to come with the Plan's.
  const up = { x: NaN, y: NaN, z: NaN };
  onPlane({ place: ORIGIN, tilt: system.tilt, node: system.node }, { along: 0, across: 0, up: 1 }, up);
  const first = unitOf(textHash(`plan ${system.id}`));
  const cameras = Array.from({ length: TURNS }, (_, at) => {
    const turn = 2 * Math.PI * (first + at / TURNS);
    const way = { x: NaN, y: NaN, z: NaN };
    onPlane(
      { place: { x: 0, y: 0, z: 0 }, tilt: system.tilt, node: system.node },
      { along: Math.cos(SLANT) * Math.cos(turn), across: Math.cos(SLANT) * Math.sin(turn), up: Math.sin(SLANT) },
      way,
    );
    return cameraTowards(along(system.place, way, distance), system.place, up);
  });
  const sizes = Array.from({ length: Math.floor(Math.log(LEAST / LARGEST) / Math.log(SHRINK)) + 1 }, (_, at) =>
    planOrbits(worlds, LARGEST * SHRINK ** at).map((world) => ({
      ...world,
      orbit: world.orbit * room,
      radius: world.radius * room,
    })),
  );
  // Each turn's largest readable size; the first turn, in the address's order, within a fifth of the best: alike systems turn apart.
  const readableAt = cameras.map((one) => sizes.findIndex((tried) => readable({ system: still, worlds: tried }, one)));
  const best = Math.min(...readableAt.filter((at) => at >= 0));
  const chosen = readableAt.findIndex((at) => at >= 0 && SHRINK ** (at - best) >= NEAR_BEST);
  const [placed, camera] = [
    sizes[chosen < 0 ? sizes.length - 1 : (readableAt[chosen] ?? 0)] ?? [],
    cameras[Math.max(chosen, 0)] ?? cameraTowards(system.place, system.place, up),
  ];
  const hidden = new Set(
    system.worlds.filter(({ id }) => !placed.some((world) => world.id === id)).map(({ id }) => id),
  );
  return {
    eye: camera.eye,
    look: system.place,
    postcard: { system: still, worlds: placed, depth: placed.map(() => 1), hidden },
    lens: PLAN_LENS,
    up,
    lean: PLAN_LEAN,
    named: chosen < 0 ? namedIn(still, placed, { camera, lens: PLAN_LENS }) : new Set(placed.map(({ id }) => id)),
  };
}

// What a Plan draws besides its worlds: each world's place, held still, and each orbit its worlds share round the star as a ring of points, on
// the map. The chunk that draws them takes them as they are, so it reads no rule of the disc and the cosmos's chunk keeps its own whole.
// The points an orbit's ellipse is drawn through: a step under a pixel's bend at the Plan's sizes.
const RING_POINTS = 96;
const ORIGIN = { x: 0, y: 0, z: 0 };

/** `system`'s Plan as drawn: its `worlds` named and linked as `words` says, each where its orbit puts it at its turn's start, and each orbit
 * its worlds share a ring of points round the star, in its plane, from the star, with the ring each world stands on. */
export function plannedOf(
  { system, worlds }: { system: StarSystem; worlds: readonly Orbiter[] },
  { names, links, named }: Pick<Planned, "names" | "links"> & { named?: ReadonlySet<string> },
): Planned {
  const unnamed = named === undefined ? [] : worlds.filter(({ id }) => !named.has(id));
  const outer = Math.max(...unnamed.map(({ orbit }) => orbit));
  const last = unnamed.filter(({ orbit }) => orbit === outer).at(-1);
  const centred = { ...system, place: ORIGIN };
  const places = worlds.map((world) => {
    const out = { x: 0, y: 0, z: 0 };
    orbitPlace({ system, world }, 0, out);
    return out;
  });
  const orbits = [...new Set(worlds.map(({ orbit }) => orbit))];
  const rings = orbits.map((orbit) =>
    Array.from({ length: RING_POINTS }, (_, step) => {
      const angle = (2 * Math.PI * step) / RING_POINTS;
      const out = { x: 0, y: 0, z: 0 };
      onPlane(centred, { along: orbit * Math.cos(angle), across: orbit * Math.sin(angle), up: 0 }, out);
      return out;
    }),
  );
  return {
    system,
    worlds,
    names,
    links,
    places,
    rings,
    ringOf: worlds.map(({ orbit }) => orbits.indexOf(orbit)),
    named: named ?? new Set(worlds.map(({ id }) => id)),
    more: last === undefined ? undefined : { id: last.id, count: unnamed.length },
  };
}
