// gnosh's colony put together: the crown at two levels, its light one past FAR_RADII of its own size from the eye; its hull's points for
// the signs, in the ground's frame (earth/ground.ts); and whether the colony stands between a point and the eye. Nothing made on a frame.
import { Group, LOD, Raycaster, Vector3, type Camera, type Intersection, type Object3D } from "three";
import type { Vec } from "../layout.ts";
import type { Hull } from "../earth/groundTypes.ts";
import { ANCHORS, crownOf } from "./crown.ts";
import { finishesOf } from "./materials.ts";
import { merged } from "./shapes.ts";

/** Past this many of its own radii from the eye, the colony takes its light level. */
export const FAR_RADII = 12;
// Its units in a planet's: the wheel's outer edge, 2.54 of its own units out, stands where a planet's sphere does, at 1.
const UNIT = 1 / 2.54;
// A hit this near the point, in the colony's radii, is the point's own hull, not something before it.
const OWN = 0.04;

export interface Colony extends Hull {
  /** What a view places, scales and turns as a planet's group. */
  readonly group: Group;
  /** The turn about its spine, the ground's own spin. */
  readonly spin: Group;
  readonly lod: LOD;
  readonly near: Object3D;
  readonly far: Object3D;
  /** The anchor `index`'s point and normal on the stage. */
  anchorAt(index: number, point: Vector3, normal: Vector3): void;
  /** Its radius on the stage: its wheel's outer edge. */
  reach(): number;
  dispose(): void;
}

// A LOD whose levels' distances are in its own radii: whatever size a view gives it, it changes level at the same share of the screen.
class SizedLod extends LOD {
  readonly #size = new Vector3();

  override update(camera: Camera): void {
    const far = this.levels[1];
    if (far !== undefined) far.distance = (FAR_RADII * this.getWorldScale(this.#size).x) / UNIT;
    super.update(camera);
  }
}

// What a sight line meets, kept from one ask to the next.
class Sight {
  readonly ray = new Raycaster();
  readonly hits: Intersection[] = [];
  readonly from = new Vector3();
  readonly way = new Vector3();
}

/** The colony, its finishes made once; free it with `dispose`. */
export function colonyOf(): Colony {
  const { finishes, dispose } = finishesOf();
  const near = merged(crownOf(true), finishes, true);
  const far = merged(crownOf(false), finishes, false);
  const lod = new SizedLod();
  lod.addLevel(near, 0);
  lod.addLevel(far, FAR_RADII);
  lod.scale.setScalar(UNIT);
  const spin = new Group();
  spin.add(lod);
  const group = new Group();
  group.name = "colony";
  group.add(spin);
  const sight = new Sight();
  const size = new Vector3();
  const reach = (): number => lod.getWorldScale(size).x / UNIT;
  return {
    group,
    spin,
    lod,
    near,
    far,
    reach,
    get scale() {
      return spin.scale.x;
    },
    anchorAt: (index, point, normal) => {
      const { at, out } = ANCHORS[index] ?? { at: [0, 0, 0], out: [0, 1, 0] };
      point.set(...at).applyMatrix4(lod.matrixWorld);
      normal.set(...out).transformDirection(lod.matrixWorld);
    },
    anchorFor: (ground, at, out) => {
      let best = ANCHORS[0];
      let most = -Infinity;
      for (const anchor of ANCHORS) {
        const facing = anchor.out[0] * ground.x + anchor.out[1] * ground.y + anchor.out[2] * ground.z;
        if (facing > most) [best, most] = [anchor, facing];
      }
      at.set(...(best?.at ?? [0, 0, 0])).multiplyScalar(UNIT);
      out.set(...(best?.out ?? [0, 1, 0]));
    },
    blocks: (point: Vec, eye: Vec) => {
      sight.from.set(eye.x, eye.y, eye.z);
      sight.way.set(point.x - eye.x, point.y - eye.y, point.z - eye.z);
      const distance = sight.way.length();
      sight.ray.set(sight.from, sight.way.normalize());
      sight.hits.length = 0;
      sight.ray.intersectObject(far, true, sight.hits);
      // The hits come nearest first: the nearest alone says whether something stands before the point.
      const [nearest] = sight.hits;
      return nearest !== undefined && nearest.distance < distance - OWN * reach();
    },
    dispose: () => {
      for (const level of [near, far])
        level.traverse((each) => {
          if ("geometry" in each && each.geometry instanceof Object) (each.geometry as { dispose(): void }).dispose();
        });
      dispose();
    },
  };
}
