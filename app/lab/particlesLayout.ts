// Where the study's particles stand (particles.ts): a system of a few worlds heads a cluster, a smaller one joins the nearest head by the
// placement's own places or stands alone in the voids; each world one particle in a few lumps round its system, gathered to its head.
import { distanceOf, EARTH_PLACE, GNO_LAND, textHash, unitOf, type Point, type StarSystem } from "@gnoworld/core";
import { Vector3 } from "three";
import type { CosmosWorld } from "../src/scene/cosmos/cosmosWorld.ts";
import type { Held } from "../src/scene/cosmos/webHeld.ts";
import { values } from "./particlesValues.ts";

/** What the study lays out: the placement's systems, the file's worlds, each one's drawn row and its use. */
export interface Data {
  readonly systems: readonly StarSystem[];
  readonly worlds: readonly CosmosWorld[];
  readonly held: readonly Held[];
  readonly at: Int32Array;
  readonly useOf: ReadonlyMap<string, number>;
}

/** A cluster: its systems, the first its head, where it stands in the far view, how far its particles reach, and its brightest world. */
export interface Cluster {
  readonly head: StarSystem;
  readonly members: readonly StarSystem[];
  readonly worlds: number;
  readonly score: number;
  readonly centre: Vector3;
  radius: number;
  readonly landmark: Vector3;
}

/** The cloud: its clusters and, for each particle, its place, its size (radius, crowd's calm, rose share), colour and cluster. */
export interface Laid {
  readonly clusters: Cluster[];
  readonly positions: Float32Array;
  readonly sizes: Float32Array;
  readonly tints: Float32Array;
  readonly owners: Float32Array;
  readonly count: number;
}

const EARTH_TINT = [0.45, 0.62, 1] as const;
const v3 = ({ x, y, z }: Point) => new Vector3(x, y, z);
const unit = (text: string) => unitOf(textHash(text));
// A normal draw, by Box and Muller, from two of a name's hashes.
const normal = (text: string) =>
  Math.sqrt(-2 * Math.log(Math.max(unit(`${text} a`), 1e-6))) * Math.cos(2 * Math.PI * unit(`${text} b`));
const normals = (key: string, flat: number) =>
  new Vector3(normal(`${key} x`), normal(`${key} y`) * flat, normal(`${key} z`));

/** The Earth's place in the far view. */
export const earthAt = () => v3(EARTH_PLACE).multiplyScalar(values.spread);

function groupsOf(systems: readonly StarSystem[]): { big: StarSystem[][]; alone: StarSystem[][] } {
  const real = systems.filter(({ id, worlds }) => id !== GNO_LAND && worlds.length > 0);
  const heads = real.filter(({ worlds }) => worlds.length >= values.clusterLeast);
  const groups = new Map(heads.map((head) => [head.id, [head]]));
  const alone: StarSystem[][] = [];
  for (const system of real) {
    if (groups.has(system.id)) continue;
    let nearest: StarSystem | undefined;
    let best = values.join;
    for (const head of heads) {
      const gap = distanceOf(system.place, head.place);
      if (gap < best) [best, nearest] = [gap, head];
    }
    if (nearest === undefined) alone.push([system]);
    else groups.get(nearest.id)?.push(system);
  }
  return { big: [...groups.values()], alone };
}

// The score stands in for 7t3's Trending, which the recorded file has none of: its worlds' use. The most used clusters take the heads' places
// nearest the Earth, in order, so the placement's spacing holds: no ring and no row made.
function clustersOf({ systems, useOf }: Data): Cluster[] {
  const { big, alone } = groupsOf(systems);
  const scored = (members: StarSystem[]) => ({
    members,
    score: members.reduce(
      (sum, { worlds }) => sum + worlds.reduce((each, { id }) => each + (useOf.get(id) ?? 0), 0),
      0,
    ),
    worlds: members.reduce((sum, { worlds }) => sum + worlds.length, 0),
    own: members[0]?.place ?? EARTH_PLACE,
  });
  const ranked = big.map(scored).sort((a, b) => b.score - a.score);
  const near = ranked.map(({ own }) => own).sort((a, b) => distanceOf(a, EARTH_PLACE) - distanceOf(b, EARTH_PLACE));
  const placed = ranked.map((group, rank) => ({
    ...group,
    place: values.popular === 1 ? (near[rank] ?? group.own) : group.own,
  }));
  return [...placed, ...alone.map(scored).map((group) => ({ ...group, place: group.own }))].flatMap(
    ({ members, score, worlds, place }) => {
      const head = members[0];
      if (head === undefined) return [];
      const centre = v3(place).multiplyScalar(values.spread);
      return [{ head, members, score, worlds, centre, radius: 1, landmark: centre.clone() }];
    },
  );
}

// A world's place: a normal draw round one of its system's lumps, its system gathered towards its cluster's head.
function placeOf(id: string, system: StarSystem, base: Vector3): Vector3 {
  const many = system.worlds.length;
  const lobes = Math.min(3, 1 + Math.floor(Math.log2(many) / 2));
  const room = values.size * Math.cbrt(many);
  const lump = normals(`${system.id} lobe ${String(textHash(id) % lobes)}`, values.flat);
  return normals(id, values.flat)
    .multiplyScalar(room * 0.42)
    .addScaledVector(lump, lobes > 1 ? room * 0.38 : 0)
    .add(base);
}

function basesOf(clusters: readonly Cluster[]): Map<string, { cluster: number; base: Vector3 }> {
  const bases = new Map<string, { cluster: number; base: Vector3 }>();
  clusters.forEach(({ head, members, centre }, cluster) => {
    for (const member of members) {
      const off = v3(member.place)
        .sub(v3(head.place))
        .multiplyScalar(values.gather * values.spread);
      bases.set(member.id, { cluster, base: centre.clone().add(off) });
    }
  });
  return bases;
}

// A cluster's brightest world, the line of light's: its head's most used.
const isLandmark = (id: string, system: StarSystem, cluster: Cluster) =>
  system === cluster.head && system.worlds[0]?.id === id;

/** Every world of the file a particle, and the Earth one more, last. */
export function laidOut(data: Data): Laid {
  const { worlds, held, at } = data;
  const clusters = clustersOf(data);
  const bases = basesOf(clusters);
  const count = held.length + 1;
  const [positions, sizes, tints] = [
    new Float32Array(count * 3),
    new Float32Array(count * 3),
    new Float32Array(count * 3),
  ];
  const owners = new Float32Array(count).fill(-1);
  const reach = clusters.map(() => ({ sum: 0, n: 0 }));
  const lay = (id: string, index: number, one: Held) => {
    const where = bases.get(one.system.id);
    if (where === undefined) return;
    const [cluster, sum] = [clusters[where.cluster], reach[where.cluster]];
    if (cluster === undefined || sum === undefined) return;
    const point = placeOf(id, one.system, where.base);
    positions.set([point.x, point.y, point.z], index * 3);
    const calm = Math.min(1, Math.sqrt(values.calm / one.system.worlds.length));
    sizes.set([one.radius * values.particle, calm, unit(`${id} rose`)], index * 3);
    tints.set(one.tint, index * 3);
    owners[index] = where.cluster;
    sum.sum += point.distanceToSquared(cluster.centre);
    sum.n += 1;
    if (isLandmark(id, one.system, cluster)) cluster.landmark.copy(point);
  };
  worlds.forEach(({ id }, from) => {
    const index = at[from] ?? -1;
    const one = held[index];
    if (one !== undefined) lay(id, index, one);
  });
  clusters.forEach((cluster, index) => {
    const { sum, n } = reach[index] ?? { sum: 0, n: 0 };
    cluster.radius = n === 0 ? 1 : Math.max(1, 1.6 * Math.sqrt(sum / n));
  });
  const earth = earthAt();
  positions.set([earth.x, earth.y, earth.z], held.length * 3);
  sizes.set([1.2 * values.particle, 1, -1], held.length * 3);
  tints.set(EARTH_TINT, held.length * 3);
  return { clusters, positions, sizes, tints, owners, count };
}
