// The whole cosmos as one mass round the Earth (7u; Alexis, 2026-11-04 night, the second study): every world and realm a particle, each
// namespace a clump in volume with seeded dust for its matter. A clump's direction comes from its id and its distance from the volume of
// the clumps more used than it, then neighbours that overlap are pushed apart; so a new world grows its clump, the clumps after it move
// out a little, no direction changes, and the same data always gives the same mass. Sized so the whole fills the dive's first view.
import { distanceOf, nextState, textHash, unitOf, type Point } from "./cell.ts";

/** The mass's sizes, in the units its layout is drawn in before it is fitted to `reach`, the dive's first view filled (7d7's 760). */
export const MASS = {
  reach: 300,
  size: 1.5,
  pack: 1.25,
  gap: 1,
  passes: 6,
  earthRoom: 6,
  spread: 0.32,
  realmNear: 0.35,
  dust: 8,
  dustMost: 48_000,
  world: 0.3,
  realm: 0.16,
  package: 0.14,
  grain: 0.07,
  earth: 0.78,
} as const;

/** What a particle is: the first three and the new are data, and only they can be aimed at; dust is scenery. */
export const MASS_KIND = { world: 0, realm: 1, package: 2, dust: 3, earth: 4, fresh: 5 } as const;

/** A world as the mass reads it: its id, its realms' paths, its use, and whether it is new; activity never moves it (ADR-0002 §3). */
export interface MassWorld {
  readonly id: string;
  readonly realms: readonly string[];
  readonly use: number;
  readonly fresh: boolean;
}
export interface MassNamespace {
  readonly id: string;
  readonly worlds: readonly MassWorld[];
  readonly packages: readonly string[];
}

/** A clump: its namespace, its real particles, its worlds, its score, its middle and reach, its most used world's place. */
export interface Clump {
  readonly id: string;
  readonly real: number;
  readonly worlds: number;
  readonly score: number;
  readonly centre: { x: number; y: number; z: number };
  radius: number;
  readonly landmark: { x: number; y: number; z: number };
}

/** The mass about the Earth: its clumps and, for each particle, its key, place, size (radius, kind, tone) and clump; the Earth last. */
export interface Mass {
  readonly clumps: readonly Clump[];
  readonly keys: readonly string[];
  readonly positions: Float32Array;
  readonly sizes: Float32Array;
  readonly owners: Float32Array;
}

// A seeded walk, read as units in [0, 1), and normal draws by Box and Muller.
const walk = (seed: number) => {
  let state = seed;
  return () => unitOf((state = nextState(state)));
};
const normal = (next: () => number) =>
  Math.sqrt(-2 * Math.log(Math.max(next(), 1e-6))) * Math.cos(2 * Math.PI * next());
const around = (next: () => number, reach: number, centre: Point) => ({
  x: centre.x + normal(next) * reach,
  y: centre.y + normal(next) * reach,
  z: centre.z + normal(next) * reach,
});
const realOf = ({ worlds, packages }: MassNamespace) =>
  worlds.reduce((sum, { realms }) => sum + 1 + realms.length, 0) + packages.length;
const scoreOf = ({ worlds, packages }: MassNamespace) =>
  worlds.reduce((sum, { use }) => sum + use, 0) + packages.length;

// The most used first, each further out by the volume of those before it, along a direction even over the sphere.
function clumpsOf(namespaces: readonly MassNamespace[]): Clump[] {
  const ranked = [...namespaces].sort((a, b) => scoreOf(b) - scoreOf(a) || (a.id < b.id ? -1 : 1));
  let volume = MASS.earthRoom ** 3;
  return ranked.map((one) => {
    const real = realOf(one);
    const radius = MASS.size * Math.cbrt(real);
    const reach = Math.cbrt(volume + radius ** 3 / 2) * MASS.pack;
    volume += radius ** 3;
    const next = walk(textHash(`mass ${one.id}`));
    const height = 2 * next() - 1;
    const [angle, round] = [2 * Math.PI * next(), Math.sqrt(1 - height * height) * reach];
    const centre = { x: round * Math.cos(angle), y: height * reach, z: round * Math.sin(angle) };
    return {
      id: one.id,
      real,
      worlds: one.worlds.length,
      score: scoreOf(one),
      centre,
      radius,
      landmark: { ...centre },
    };
  });
}

// Two clumps that overlap pushed apart, the less used alone, so a clump never moves for one ranked after it; neighbours found through a
// grid, so a pass is about linear in the clumps.
function apart(clumps: readonly Clump[]): void {
  const cell = 2 * MASS.gap * Math.max(1, ...clumps.map(({ radius }) => radius));
  for (let pass = 0; pass < MASS.passes; pass += 1) {
    const grid = new Map<string, number[]>();
    clumps.forEach(({ centre }, at) => {
      const name = key(Math.floor(centre.x / cell), Math.floor(centre.y / cell), Math.floor(centre.z / cell));
      grid.set(name, [...(grid.get(name) ?? []), at]);
    });
    clumps.forEach((a, first) => {
      for (const other of nearOf(grid, a.centre, cell)) if (other > first) push(a, clumps[other]);
    });
  }
}

const key = (x: number, y: number, z: number) => `${String(x)} ${String(y)} ${String(z)}`;

// The clumps in the grid's 27 cells round `at`.
function nearOf(grid: ReadonlyMap<string, number[]>, at: Point, cell: number): number[] {
  const [cx, cy, cz] = [at.x, at.y, at.z].map((value) => Math.floor(value / cell));
  const near: number[] = [];
  for (let dx = -1; dx <= 1; dx += 1)
    for (let dy = -1; dy <= 1; dy += 1)
      for (let dz = -1; dz <= 1; dz += 1)
        near.push(...(grid.get(key((cx ?? 0) + dx, (cy ?? 0) + dy, (cz ?? 0) + dz)) ?? []));
  return near;
}

function push(a: Clump, b: Clump | undefined): void {
  if (b === undefined) return;
  const gap = distanceOf(a.centre, b.centre);
  const least = (a.radius + b.radius) * MASS.gap;
  if (gap >= least || gap === 0) return;
  const share = (least - gap) / gap;
  for (const axis of ["x", "y", "z"] as const) b.centre[axis] += share * (b.centre[axis] - a.centre[axis]);
}

interface Writer {
  readonly keys: string[];
  readonly positions: number[];
  readonly sizes: number[];
  readonly owners: number[];
  owner: number;
  grains: number;
}
const put = (out: Writer, at: Point, [key, radius, kind]: readonly [key: string, radius: number, kind: number]) => {
  out.keys.push(key);
  out.positions.push(at.x, at.y, at.z);
  out.sizes.push(radius, kind, unitOf(textHash(`${key} tone`)));
  out.owners.push(out.owner);
};
const varied = (size: number, next: () => number) => size * (0.7 + 0.6 * next());

// A clump's particles: its worlds round its middle, each world's realms close by it, its packages through it, its dust filling it.
function clumpInto(one: MassNamespace, clump: Clump, out: Writer): void {
  const spread = clump.radius * MASS.spread;
  const most = Math.max(...one.worlds.map(({ use }) => use));
  for (const world of one.worlds) {
    const next = walk(textHash(world.id));
    const at = around(next, spread, clump.centre);
    if (world.use === most) Object.assign(clump.landmark, at);
    const radius = MASS.world * Math.min(2.2, 1 + Math.log2(1 + world.use) / 4);
    put(out, at, [world.id, radius, world.fresh ? MASS_KIND.fresh : MASS_KIND.world]);
    for (const realm of world.realms)
      put(out, around(next, spread * MASS.realmNear, at), [realm, varied(MASS.realm, next), MASS_KIND.realm]);
  }
  for (const path of one.packages) {
    const next = walk(textHash(path));
    put(out, around(next, spread * 1.1, clump.centre), [path, varied(MASS.package, next), MASS_KIND.package]);
  }
  const next = walk(textHash(`${one.id} dust`));
  for (let grain = 0; grain < out.grains; grain += 1) {
    const radius = MASS.grain * (0.4 + next() ** 2 * 1.6);
    put(out, around(next, spread * 1.25, clump.centre), [`${one.id}#${String(grain)}`, radius, MASS_KIND.dust]);
  }
}

/** The mass of `namespaces` about the Earth, fitted to `MASS.reach`. */
export function massOf(namespaces: readonly MassNamespace[]): Mass {
  const clumps = clumpsOf(namespaces);
  apart(clumps);
  const byId = new Map(namespaces.map((one) => [one.id, one]));
  const real = clumps.reduce((sum, clump) => sum + clump.real, 0);
  const share = Math.min(MASS.dust, MASS.dustMost / Math.max(1, real));
  const out: Writer = { keys: [], positions: [], sizes: [], owners: [], owner: 0, grains: 0 };
  clumps.forEach((clump, at) => {
    const one = byId.get(clump.id);
    out.owner = at;
    out.grains = Math.round(clump.real * share);
    if (one !== undefined) clumpInto(one, clump, out);
  });
  out.owner = -1;
  put(out, { x: 0, y: 0, z: 0 }, ["earth", MASS.earth, MASS_KIND.earth]);
  return fitted(clumps, out);
}

// Scaled so its farthest clump's edge stands `MASS.reach` from the Earth: the whole fills the dive's first view, whatever it holds.
function fitted(clumps: readonly Clump[], out: Writer): Mass {
  const reach = clumps.reduce(
    (most, { centre, radius }) => Math.max(most, Math.hypot(centre.x, centre.y, centre.z) + radius),
    1,
  );
  const scale = MASS.reach / reach;
  for (const clump of clumps) {
    for (const axis of ["x", "y", "z"] as const) {
      clump.centre[axis] *= scale;
      clump.landmark[axis] *= scale;
    }
    clump.radius *= scale;
  }
  const sizes = new Float32Array(out.sizes);
  for (let at = 0; at < sizes.length; at += 3) sizes[at] = (sizes[at] ?? 0) * scale;
  return {
    clumps,
    keys: out.keys,
    positions: new Float32Array(out.positions.map((value) => value * scale)),
    sizes,
    owners: new Float32Array(out.owners),
  };
}
