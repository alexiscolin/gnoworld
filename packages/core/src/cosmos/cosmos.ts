// core/cosmos (slice 7, 7c; ADR-0002 §3 and §10): where each system sits. A thick disc with constant density, clusters above and
// below it from a smooth field of position (no list of clusters), and a curated ecosystem's namespaces placed together.
// Placing one system depends on no other: the set enters only through its size (a power-of-two step) and an ecosystem's size.
// The hash and the field use only integer arithmetic (+ - * / and floor), so every engine gives the same bytes (no sin, cos or pow).
// The disc's radius takes one sqrt (exactly rounded by IEEE-754). Placement is a random point in the disc, not ADR-0002 §3's
// ring-by-ring cell ladder: that deviation is Alexis's to decide (F3520).

/** The unit of spacing, in scene units. */
export const CELL = 10;
/** A system sits within this distance above or below the field. */
export const DISC_HALF_THICKNESS = 2;
/** The field never passes this height, either way. */
export const MAX_HEIGHT = 8;

// The field's lattice spacing. The noise is cubed, which keeps most of the plane near the disc: the slope is then at most
// MAX_HEIGHT * 3 * (3 * sqrt(2)) / LATTICE = 0.49, under the 0.5 the tests hold.
const LATTICE = 21 * CELL;
// Systems per CELL squared, at most: 1 / DENSITY.
const DENSITY = 4;

export interface SystemPlace {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PlaceOptions {
  /** The number of systems in the set. */
  readonly count?: number;
  /** The curated ecosystem the system belongs to, if any. */
  readonly ecosystem?: string;
  /** How many systems the ecosystem holds (1 or more): its cluster grows with it, at the disc's density. */
  readonly ecosystemSize?: number;
}

/** A system to place: its id and, if curated, its ecosystem. */
export interface SystemRef {
  readonly id: string;
  readonly ecosystem?: string;
}

function mix(value: number): number {
  let h = value | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

// FNV-1a over UTF-16 code units, then mixed, so near ids are far apart.
function hashOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return mix(h);
}

// The `k`th number of an id's stream, in [0, 1).
function unit(seed: number, k: number): number {
  return mix(seed + Math.imul(k + 1, 0x9e3779b1)) / 4294967296;
}

// A lattice point's value, in [-1, 1).
function lattice(ix: number, iz: number): number {
  return unit(mix(Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1)), 0) * 2 - 1;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** The height of the clusters at a position: smooth (a slope of at most 0.5), in [-MAX_HEIGHT, MAX_HEIGHT], mostly flat. */
export function heightField(x: number, z: number): number {
  const gx = x / LATTICE;
  const gz = z / LATTICE;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const tx = smooth(gx - ix);
  const tz = smooth(gz - iz);
  const near = lattice(ix, iz) * (1 - tx) + lattice(ix + 1, iz) * tx;
  const far = lattice(ix, iz + 1) * (1 - tx) + lattice(ix + 1, iz + 1) * tx;
  const noise = near * (1 - tz) + far * tz;
  return noise * noise * noise * MAX_HEIGHT;
}

// The power of two that holds `count` systems: the disc only grows when this does.
function stepOf(count: number): number {
  let step = 1;
  while (step < count) step *= 2;
  return step;
}

// The radius of a disc that holds `systems` at the constant density.
const radiusFor = (systems: number): number => CELL * Math.sqrt((systems * DENSITY) / Math.PI);

// A point of the disc of radius `radius`, drawn from a seed's stream by rejection from the square around it.
function inDisc(seed: number, radius: number): { x: number; z: number } {
  for (let k = 0; ; k += 2) {
    const x = (unit(seed, k) * 2 - 1) * radius;
    const z = (unit(seed, k + 1) * 2 - 1) * radius;
    if (x * x + z * z <= radius * radius) return { x, z };
  }
}

/** Where one system sits: a function of its id, the set's size and its ecosystem, and of no other system. */
export function placeSystem(id: string, options: PlaceOptions = {}): SystemPlace {
  const { count = 1, ecosystem, ecosystemSize = 1 } = options;
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError("cosmos: the count is no whole number from 0");
  if (!Number.isSafeInteger(ecosystemSize) || ecosystemSize < 1)
    throw new RangeError("cosmos: an ecosystem holds a whole number of systems, 1 or more");
  const disc = radiusFor(stepOf(count));
  let spot: { x: number; z: number };
  if (ecosystem === undefined) {
    spot = inDisc(hashOf(`system ${id}`), disc);
  } else {
    const cluster = radiusFor(ecosystemSize);
    const centre = inDisc(hashOf(`ecosystem ${ecosystem}`), Math.max(0, disc - cluster));
    const offset = inDisc(hashOf(`system ${id}`), cluster);
    spot = { x: centre.x + offset.x, z: centre.z + offset.z };
  }
  const lift = (unit(hashOf(`system ${id}`), 1_000_001) * 2 - 1) * DISC_HALF_THICKNESS;
  return { x: spot.x, y: heightField(spot.x, spot.z) + lift, z: spot.z };
}

/** The places of a set of systems, by id: the same set, in any order, gives the same map. A repeated id counts once. */
export function placeSystems(set: readonly SystemRef[]): Map<string, SystemPlace> {
  const systems = new Map<string, string | undefined>();
  for (const { id, ecosystem } of set) systems.set(id, ecosystem);
  const sizes = new Map<string, number>();
  for (const ecosystem of systems.values()) {
    if (ecosystem !== undefined) sizes.set(ecosystem, (sizes.get(ecosystem) ?? 0) + 1);
  }
  const places = new Map<string, SystemPlace>();
  for (const [id, ecosystem] of systems) {
    places.set(
      id,
      placeSystem(id, {
        count: systems.size,
        ...(ecosystem === undefined ? {} : { ecosystem, ecosystemSize: sizes.get(ecosystem) ?? 1 }),
      }),
    );
  }
  return places;
}
