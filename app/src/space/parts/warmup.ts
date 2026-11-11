// A planet's first draw costs its GPU pipeline even once its programs compiled: drawn once, tiny and in front of the camera, a frame
// before it is shown, that cost falls where nothing shows, and the frame it comes in is an ordinary one.
import type { Camera, Object3D } from "three";
import { Vector3 } from "three";

export interface Warming {
  readonly drawn: { readonly group: Object3D };
  /** Its programs compiled. */
  built: boolean;
  /** Drawn once, tiny. */
  warmed: boolean;
  /** Ready to be shown: compiled and drawn. */
  compiled: boolean;
}

const WAS = new WeakMap<Object3D, { visible: boolean; culled: boolean }>();
const AHEAD = new Vector3();

/** One frame's step of `held`'s warm-up: the frame it is drawn tiny, then the frame it is put back and counts as ready. */
export function warmFrame(held: Warming, camera: Camera): void {
  const { group } = held.drawn;
  if (!held.built || held.compiled) return;
  if (held.warmed) {
    group.traverse((part) => {
      const was = WAS.get(part);
      if (was !== undefined) [part.visible, part.frustumCulled] = [was.visible, was.culled];
    });
    group.scale.setScalar(1);
    held.compiled = true;
    return;
  }
  group.traverse((part) => {
    WAS.set(part, { visible: part.visible, culled: part.frustumCulled });
    [part.visible, part.frustumCulled] = [true, false];
  });
  group.position.copy(camera.getWorldPosition(AHEAD)).addScaledVector(camera.getWorldDirection(new Vector3()), 5);
  group.scale.setScalar(1e-5);
  held.warmed = true;
}
