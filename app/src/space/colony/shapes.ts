// The shapes a colony is joined from, in its own frame (its spine up, +y), and their merging: one mesh a finish, so a level is a few draws
// whatever its parts.
import { BufferGeometry, CylinderGeometry, Mesh, Object3D, TorusGeometry, Vector3, type Material } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export type V3 = readonly [number, number, number];

/** A point of a hull and the hull's outward normal there, in the colony's frame. */
export interface Spot {
  readonly at: V3;
  readonly out: V3;
}

const UP = new Vector3(0, 1, 0);

/** `geo` turned so its +y points along `axis`, moved to `at`, its UVs scaled by `uv`; unindexed, so any merge with another holds. */
export function placed(
  geo: BufferGeometry,
  { at, axis, uv }: { at: V3; axis?: V3 | undefined; uv?: readonly [number, number] | undefined },
): BufferGeometry {
  if (axis !== undefined) {
    const turn = new Object3D();
    turn.quaternion.setFromUnitVectors(UP, new Vector3(...axis).normalize());
    turn.updateMatrix();
    geo.applyMatrix4(turn.matrix);
  }
  geo.translate(...at);
  if (uv !== undefined) {
    const uvs = geo.getAttribute("uv");
    for (let index = 0; index < uvs.count; index += 1)
      uvs.setXY(index, uvs.getX(index) * uv[0], uvs.getY(index) * uv[1]);
  }
  return geo.index === null ? geo : geo.toNonIndexed();
}

/** A closed cylinder of radius `radius`, `height` long along +y, `sides` round. */
export const cylinder = (radius: number, height: number, sides = 24): CylinderGeometry =>
  new CylinderGeometry(radius, radius, height, sides);

/** A point on a ring's tube (`ring` its centre's radius, `tube` the tube's, `y` its height): `round` along the ring, `up` round the tube from
 * its outer side (pi/2 its top). */
export function onTube(
  { ring, tube, y = 0 }: { ring: number; tube: number; y?: number },
  round: number,
  up: number,
): Spot {
  const out: V3 = [Math.cos(round) * Math.cos(up), Math.sin(up), Math.sin(round) * Math.cos(up)];
  return {
    at: [Math.cos(round) * ring + out[0] * tube, y + out[1] * tube, Math.sin(round) * ring + out[2] * tube],
    out,
  };
}

/** A thin tube from `from` to `to`: a strut, or a lit lane. */
export function strut(from: V3, to: V3, radius = 0.012): BufferGeometry {
  const [a, b] = [new Vector3(...from), new Vector3(...to)];
  const way = b.clone().sub(a);
  const middle = a.add(b).multiplyScalar(0.5);
  return placed(cylinder(radius, way.length(), 6), { at: [middle.x, middle.y, middle.z], axis: [way.x, way.y, way.z] });
}

/** A ring round the spine, `radius` wide at height `y`, its tube `tube` thick, leaned `lean` off the spine. */
export function ringOf({
  radius,
  y,
  tube,
  lean = 0,
  sides = 160,
}: {
  radius: number;
  y: number;
  tube: number;
  lean?: number;
  sides?: number;
}) {
  const ring = new TorusGeometry(radius, tube, Math.max(6, Math.round(sides / 10)), sides);
  ring.rotateX(Math.PI / 2 + lean);
  return placed(ring, { at: [0, y, 0] });
}

/** The parts of a level, by finish. */
export type Parts<Finish extends string> = Partial<Record<Finish, BufferGeometry[]>>;

/** One mesh a finish, casting and taking shadows where `shadows`; the parts' geometries merged, then freed. */
export function merged<Finish extends string>(
  parts: Parts<Finish>,
  finishes: Readonly<Record<Finish, Material>>,
  shadows: boolean,
): Object3D {
  const level = new Object3D();
  for (const [finish, list] of Object.entries(parts) as [Finish, BufferGeometry[]][]) {
    if (list.length === 0) continue;
    const geometry = mergeGeometries(list);
    for (const part of list) part.dispose();
    const mesh = new Mesh(geometry, finishes[finish]);
    [mesh.castShadow, mesh.receiveShadow] = [shadows, shadows];
    mesh.matrixAutoUpdate = false;
    level.add(mesh);
  }
  return level;
}
