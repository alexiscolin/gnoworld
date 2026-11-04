// Where the study's particles stand (particles.ts), the second study (Alexis, 2026-11-04 night): one solid mass round the Earth. Each
// namespace a clump in volume, its worlds, their realms near each, its packages, and seeded dust for matter; each clump's direction from its
// id, its distance from the Earth from the volume of the clumps more used than it, then pushed off its neighbours. A new world grows its
// clump, so the clumps after it move out a little and no direction changes: nothing jumps, and the same data gives the same mass.
import { textHash, unitOf } from "@gnoworld/core";
import { Vector3 } from "three";
import { values } from "./particlesValues.ts";

/** A clump's matter as the data gives it: its namespace, its worlds with their realms and use, its packages. */
export interface Namespace {
  readonly id: string;
  readonly worlds: readonly { readonly id: string; readonly realms: readonly string[]; readonly use: number }[];
  readonly packages: readonly string[];
}

/** What a particle is: only the first three are data, and only they can be aimed at. */
const KIND = { world: 0, realm: 1, package: 2, dust: 3, earth: 4 } as const;

export interface Cluster {
  readonly id: string;
  readonly real: number;
  readonly worlds: number;
  readonly score: number;
  readonly centre: Vector3;
  readonly radius: number;
  readonly landmark: Vector3;
}

/** The mass: its clusters, and for each particle its key, place, size (radius, kind, colour share) and cluster. */
export interface Laid {
  readonly clusters: Cluster[];
  readonly keys: string[];
  readonly positions: Float32Array;
  readonly sizes: Float32Array;
  readonly owners: Float32Array;
  readonly count: number;
}

const unit = (text: string) => unitOf(textHash(text));
// A normal draw, by Box and Muller, from two of a name's hashes.
const normal = (text: string) =>
  Math.sqrt(-2 * Math.log(Math.max(unit(`${text} a`), 1e-6))) * Math.cos(2 * Math.PI * unit(`${text} b`));
const normals = (key: string) => new Vector3(normal(`${key} x`), normal(`${key} y`), normal(`${key} z`));
// A direction from a name, even over the sphere.
function directionOf(id: string): Vector3 {
  const height = 2 * unit(`dir ${id} h`) - 1;
  const angle = 2 * Math.PI * unit(`dir ${id} a`);
  const round = Math.sqrt(1 - height * height);
  return new Vector3(round * Math.cos(angle), height, round * Math.sin(angle));
}

const realOf = ({ worlds, packages }: Namespace) =>
  worlds.reduce((sum, { realms }) => sum + 1 + realms.length, 0) + packages.length;
const scoreOf = ({ worlds, packages }: Namespace) => worlds.reduce((sum, { use }) => sum + use, 0) + packages.length;

// The most used first, each further out by the volume of those before it; then neighbours that overlap pushed apart, the later one more.
function placed(namespaces: readonly Namespace[]): Cluster[] {
  const ranked = [...namespaces].sort((a, b) => scoreOf(b) - scoreOf(a) || (a.id < b.id ? -1 : 1));
  let volume = values.earthRoom ** 3;
  const clusters = ranked.map((one) => {
    const real = realOf(one);
    const radius = values.size * Math.cbrt(real);
    const reach = Math.cbrt(volume + radius ** 3 / 2) * values.pack;
    volume += radius ** 3;
    const centre = directionOf(one.id).multiplyScalar(reach);
    return {
      id: one.id,
      real,
      worlds: one.worlds.length,
      score: scoreOf(one),
      centre,
      radius,
      landmark: centre.clone(),
    };
  });
  apart(clusters);
  return clusters;
}

// ponytail: every pair, a few passes; a hundred namespaces is ten thousand checks a pass, and a thousand would want a grid.
function apart(clusters: readonly Cluster[]): void {
  const push = new Vector3();
  for (let pass = 0; pass < values.passes; pass += 1)
    clusters.forEach((a, first) => {
      for (const b of clusters.slice(first + 1)) {
        const least = (a.radius + b.radius) * values.gap;
        push.subVectors(b.centre, a.centre);
        const gap = push.length();
        if (gap >= least || gap === 0) continue;
        push.multiplyScalar((least - gap) / gap);
        a.centre.addScaledVector(push, -0.25);
        b.centre.addScaledVector(push, 0.75);
      }
    });
}

// The particles written so far, and the cluster the next ones belong to.
interface Writer {
  readonly keys: string[];
  readonly positions: number[];
  readonly sizes: number[];
  readonly owners: number[];
  owner: number;
}
interface Particle {
  readonly key: string;
  readonly at: Vector3;
  readonly radius: number;
  readonly kind: number;
}
// Its colour share from its key, as its place is.
const write = (out: Writer, { key, at, radius, kind }: Particle) => {
  out.keys.push(key);
  out.positions.push(at.x, at.y, at.z);
  out.sizes.push(radius, kind, unit(`${key} rose`));
  out.owners.push(out.owner);
};
// Between 0.7 and 1.3 of `size`, by a key: no two read the same.
const varied = (size: number, key: string) => size * (0.7 + 0.6 * unit(`${key} s`));
const round = (key: string, reach: number, centre: Vector3) => normals(key).multiplyScalar(reach).add(centre);

// A clump's particles: its worlds round its middle, each world's realms close by it, its packages through it, its dust filling it.
function clumpOf(one: Namespace, cluster: Cluster, out: Writer): void {
  const spread = cluster.radius * values.clump;
  const [first] = [...one.worlds].sort((a, b) => b.use - a.use);
  for (const world of one.worlds) {
    const at = round(world.id, spread, cluster.centre);
    if (world === first) cluster.landmark.copy(at);
    const radius = values.world * Math.min(2.2, 1 + Math.log2(1 + world.use) / 4);
    write(out, { key: world.id, at, radius, kind: KIND.world });
    for (const realm of world.realms) {
      const near = round(realm, spread * values.realmNear, at);
      write(out, { key: realm, at: near, radius: varied(values.realm, realm), kind: KIND.realm });
    }
  }
  for (const path of one.packages) {
    const at = round(path, spread * 1.1, cluster.centre);
    write(out, { key: path, at, radius: varied(values.package, path), kind: KIND.package });
  }
  const dust = Math.round(cluster.real * values.dust);
  for (let grain = 0; grain < dust; grain += 1) {
    const key = `${one.id} dust ${String(grain)}`;
    const radius = values.grain * (0.4 + unit(`${key} s`) ** 2 * 1.6);
    write(out, { key, at: round(key, spread * 1.25, cluster.centre), radius, kind: KIND.dust });
  }
}

/** Every world, realm and package a particle, each clump's dust, and the Earth at the middle, last. */
export function laidOut(namespaces: readonly Namespace[]): Laid {
  const clusters = placed(namespaces);
  const byId = new Map(namespaces.map((one) => [one.id, one]));
  const out: Writer = { keys: [], positions: [], sizes: [], owners: [], owner: 0 };
  clusters.forEach((cluster, index) => {
    const one = byId.get(cluster.id);
    out.owner = index;
    if (one !== undefined) clumpOf(one, cluster, out);
  });
  out.owner = -1;
  write(out, { key: "earth", at: new Vector3(), radius: values.world * 2.6, kind: KIND.earth });
  return {
    clusters,
    keys: out.keys,
    positions: new Float32Array(out.positions),
    sizes: new Float32Array(out.sizes),
    owners: new Float32Array(out.owners),
    count: out.keys.length,
  };
}
