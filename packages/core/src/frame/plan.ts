// A system's Plan (part 7v; Alexis, 2026-11-03), seen from above its plane: the only view that draws its orbits, as ellipses, to pick a
// world more simply. Its star at the screen's centre, each world of a body's size on an orbit of its own, in the order of its real one but
// spread so each stands clear with room for its name under it, at a size that keeps their order; whole on both screens, none on the star's
// heart. Its worlds hold still. The address picks the turn the views are tried from, so the same address gives the same Plan. The Earth's,
// from above, each project round it on an orbit of its own, apart from what stands by the Earth at rest, so the depth's chunk has no Plan.
import { EARTH_PLACE, EARTH_RADIUS, GRAIN, WORLD_MOST, type Orbiter, type StarSystem } from "../cosmos/system.ts";
import { textHash, unitOf } from "../space/cell.ts";
import type { Arrival } from "./arrival.ts";
import { onPlane, orbitPlace } from "./disc.ts";
import { earthSystemOf, type Project } from "./earthOrbit.ts";
import type { Planned } from "../lod/drawn.ts";
import {
  along,
  cameraOf,
  cameraTowards,
  DEGREE,
  focalOf,
  looksFrom,
  placeOf,
  REST_SCREENS,
  STAR_HEART,
} from "./restLook.ts";

/** The most worlds a Plan draws, the largest first: past them its others are dust. */
const PLAN_MOST = 12;
// A Plan's own lens, in degrees (the chief, 2026-11-04): a chart, its orbits round their star, where the home's 42.5 degrees put the outer
// ellipse's centre 122 px under it; the offset falls with the lens's tangent, 17 px here at the video's screen (7v's design review, F4470).
const PLAN_LENS = 7;
// Seen 30 degrees over the plane: its orbits read as ellipses half as high as wide, the mock-up's.
const SLANT = 30 * DEGREE;
const TURNS = 24;
// Its outer orbit spans this share of the narrower screen's width; its largest world this share of that orbit.
const SPAN = 0.78;
const LARGEST = 0.14;
// The inner orbit, as a share of the outer one, and the least gap between two, in their worlds' radii, the room for a name between.
const INNER = 0.24;
const GAP = 1.2;
// The sizes tried, from the largest down, a tenth smaller each time.
const LEAST = 0.02;
const SHRINK = 0.9;
// A name's room under its world, in pixels: its height, and half its width at the least.
const NAME_HIGH = 30;
const NAME_HALF = 60;
const HEADER = 0.09;
const MARGIN = 16;

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

// The Plan's orbits, its outer at 1 or past it: each world `GAP` of their radii or more past the one before, else in proportion to its real
// orbit; each world `size` of the outer orbit at the most used's size, by its own.
function spread(worlds: readonly Orbiter[], size: number): Orbiter[] {
  const [first] = worlds;
  const span = Math.max(...worlds.map(({ orbit }) => orbit - (first?.orbit ?? 0)), 1e-9);
  const placed: Orbiter[] = [];
  for (const { own: _own, ...world } of worlds) {
    const before = placed.at(-1);
    const radius = ((_own ?? world.radius) / WORLD_MOST) * size;
    const real = INNER + ((world.orbit - (first?.orbit ?? 0)) * (1 - INNER)) / span;
    placed.push({
      ...world,
      radius,
      orbit: Math.max(real, before === undefined ? INNER : before.orbit + GAP * Math.max(before.radius, radius)),
    });
  }
  return placed;
}

// The Plan's worlds `size` of its outer orbit at the most used's size, its outer orbit at 1.
function planOrbits(worlds: readonly Orbiter[], size: number): Orbiter[] {
  const placed = spread(worlds, size);
  const outer = Math.max(placed.at(-1)?.orbit ?? 1, 1);
  return placed.map((world) => ({ ...world, orbit: world.orbit / outer, radius: world.radius / outer }));
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
    const boxes = spots.map(({ x, y, radius }) => ({
      left: x - Math.max(radius, NAME_HALF),
      right: x + Math.max(radius, NAME_HALF),
      top: y - radius,
      bottom: y + radius + NAME_HIGH,
    }));
    const meet = (a: (typeof boxes)[number], b: (typeof boxes)[number]) =>
      a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    return (
      spots.every(({ x, y, radius }) => Math.hypot(x - star.x, y - star.y) - radius >= heart) &&
      boxes.every(
        (box) =>
          box.left >= MARGIN &&
          box.right <= look.width - MARGIN &&
          box.top >= HEADER * look.height &&
          box.bottom <= look.height - MARGIN,
      ) &&
      boxes.every((box, at) => boxes.slice(at + 1).every((other) => !meet(box, other)))
    );
  });
}

/** `system`'s Plan: the eye over its plane at a slant, far enough that its outer orbit spans most of the narrower screen, at the first turn
 * from its address's that stands every world readable, at the largest size that lets one; its first turn at the least size if none does.
 * Its postcard holds the Plan's worlds, still, and leaves out every other. */
export function planOf(system: StarSystem): Arrival {
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
  const inRoom = (size: number) =>
    planOrbits(worlds, size).map((world) => ({ ...world, orbit: world.orbit * room, radius: world.radius * room }));
  let [placed, camera] = [inRoom(LEAST), cameras[0] ?? cameraTowards(system.place, system.place, up)];
  for (let size = LARGEST; size >= LEAST; size *= SHRINK) {
    const tried = inRoom(size);
    const found = cameras.find((one) => readable({ system: still, worlds: tried }, one));
    if (found !== undefined) {
      [placed, camera] = [tried, found];
      break;
    }
  }
  const hidden = new Set(
    system.worlds.filter(({ id }) => !placed.some((world) => world.id === id)).map(({ id }) => id),
  );
  return {
    eye: camera.eye,
    look: system.place,
    postcard: { system: still, worlds: placed, depth: placed.map(() => 1), hidden },
    lens: PLAN_LENS,
    up,
  };
}

// The Earth's Plan: 30 degrees over the disc, the Earth 80 pixels in radius on the video's screen; its projects 2.4 to 7.5 Earth radii out,
// growing gaps, each a quarter of the Earth across, a golden turn apart round it. Out to 9, its outer ellipse stood 26 px off the Earth
// through the Plan's lens, its offset the square of its reach on screen (7v's design review, F4470).
const PLAN_EARTH = 80;
const PLAN_FIRST = 2.4;
const PLAN_LAST = 7.5;
const PLAN_SIZE = 0.25;
const GOLDEN = 2.399963229728653;
// The Earth's disc and a name's air round it, in pixels, that no project stands in; the whole is turned as a system's is, tried in order.
const CLEAR = PLAN_EARTH + 30;

/** The Earth's Plan: from the view at rest's side, 30 degrees over the disc, the Earth at the centre; each project, in the file's order, on
 * an orbit of its own, a golden turn from the one before, the whole turned the first of a few ways that stands every name readable; still. */
export function earthPlanOf(projects: readonly Pick<Project, "name">[]): Arrival {
  const earth = { ...earthSystemOf(projects), spin: 0 };
  const last = Math.max(earth.worlds.length - 1, 1);
  const distance = (focalOf(REST_SCREENS[0].height, PLAN_LENS) * EARTH_RADIUS) / PLAN_EARTH;
  const camera = cameraOf({ distance, slant: SLANT, turn: 0 });
  const turned = (turn: number) =>
    earth.worlds.map((world, at) => ({
      ...world,
      radius: PLAN_SIZE * EARTH_RADIUS,
      orbit: (PLAN_FIRST + (PLAN_LAST - PLAN_FIRST) * (at / last) ** 0.8) * EARTH_RADIUS,
      phase: at * GOLDEN + (2 * Math.PI * turn) / TURNS,
    }));
  const turn = Array.from({ length: TURNS }, (_, at) => at).find((at) =>
    readable({ system: earth, worlds: turned(at) }, camera, CLEAR),
  );
  const worlds = turned(turn ?? 0);
  return {
    eye: camera.eye,
    look: EARTH_PLACE,
    postcard: { system: earth, worlds, depth: worlds.map(() => 1), hidden: new Set() },
    lens: PLAN_LENS,
  };
}

// What a Plan draws besides its worlds: each world's place, held still, and its orbit round the star as a ring of points, on the map. The
// chunk that draws them takes them as they are, so it reads no rule of the disc and the cosmos's chunk keeps its own whole.
// The points an orbit's ellipse is drawn through: a step under a pixel's bend at the Plan's sizes.
const RING_POINTS = 96;
const ORIGIN = { x: 0, y: 0, z: 0 };

/** `system`'s Plan as drawn: its `worlds` named and linked as `words` says, each where its orbit puts it at its turn's start, and each orbit a
 * ring of points round the star, in its plane, from the star. */
export function plannedOf(
  { system, worlds }: { system: StarSystem; worlds: readonly Orbiter[] },
  { names, links }: Pick<Planned, "names" | "links">,
): Planned {
  const centred = { ...system, place: ORIGIN };
  const places = worlds.map((world) => {
    const out = { x: 0, y: 0, z: 0 };
    orbitPlace({ system, world }, 0, out);
    return out;
  });
  const rings = worlds.map(({ orbit }) =>
    Array.from({ length: RING_POINTS }, (_, step) => {
      const angle = (2 * Math.PI * step) / RING_POINTS;
      const out = { x: 0, y: 0, z: 0 };
      onPlane(centred, { along: orbit * Math.cos(angle), across: orbit * Math.sin(angle), up: 0 }, out);
      return out;
    }),
  );
  return { system, worlds, names, links, places, rings };
}
