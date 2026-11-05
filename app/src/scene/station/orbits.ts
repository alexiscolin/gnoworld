// The close stations' orbits (part 7x), one line set round the Earth, drawn only from above: each leans its own way, so they cross and
// never read as rings. Seen from the view at rest they are not there; they come in as the eye rises to the top view (fade, 0 to 1).
import { onOrbit, toScene, type PlacedStation, type Point } from "@gnoworld/core";
import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments } from "three";

const STEPS = 128;
const OPACITY = 0.09;

/** The orbits of `close`, round the group's origin, which stands at the Earth whose place on the stage is `earth`. */
export function orbitsOf(
  close: readonly PlacedStation[],
  earth: Point,
): LineSegments<BufferGeometry, LineBasicMaterial> {
  const points: number[] = [];
  const at = { x: 0, y: 0, z: 0 };
  const ring: number[] = [];
  for (const { orbit } of close) {
    ring.length = 0;
    for (let step = 0; step <= STEPS; step += 1) {
      toScene(onOrbit(orbit, (step * 2 * Math.PI) / STEPS), at);
      ring.push(at.x - earth.x, at.y - earth.y, at.z - earth.z);
    }
    for (let step = 0; step < STEPS; step += 1) points.push(...ring.slice(3 * step, 3 * step + 6));
  }
  const geometry = new BufferGeometry().setAttribute("position", new Float32BufferAttribute(points, 3));
  const lines = new LineSegments(
    geometry,
    new LineBasicMaterial({ color: 0xfff0dd, transparent: true, opacity: 0, depthWrite: false }),
  );
  lines.visible = false;
  return lines;
}

/** Shows `lines` at `fade` of their full strength, none hidden. */
export function fadeOrbits(lines: LineSegments<BufferGeometry, LineBasicMaterial>, fade: number): void {
  lines.material.opacity = OPACITY * fade;
  lines.visible = fade > 0;
}
