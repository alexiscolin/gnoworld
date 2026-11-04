// The chosen clump's rings (web.ts; 7u): three thin circles round it, at 1, 1.6 and 2.3 times its reach, in its own leaning plane, a
// highlight and never a layout; their tone is the palette's, as faint as a line.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  type Color,
} from "three";
import type { Clump } from "@gnoworld/core";

const SHARES = [1, 1.6, 2.3] as const;
const SIDES = 160;
const LIGHT = 0.3;
const LEAN = 0.42;

export class WebRings {
  readonly group = new Group();
  /** Its material, which the page's text's box keeps clear (offTheBox.ts). */
  readonly look: LineBasicMaterial;
  readonly #geometry = new BufferGeometry();

  constructor() {
    this.look = new LineBasicMaterial({
      transparent: true,
      opacity: LIGHT,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    // Each ring's sides as segments, its two ends a side each: the three rings one geometry, one draw.
    const corners = new Float32Array(SHARES.length * SIDES * 6);
    SHARES.forEach((share, ring) => {
      for (let side = 0; side < SIDES; side += 1)
        for (const [end, at] of [side, side + 1].entries()) {
          const angle = (2 * Math.PI * at) / SIDES;
          corners.set([share * Math.cos(angle), 0, share * Math.sin(angle)], ((ring * SIDES + side) * 2 + end) * 3);
        }
    });
    this.#geometry.setAttribute("position", new BufferAttribute(corners, 3));
    const lines = new LineSegments(this.#geometry, this.look);
    lines.frustumCulled = false;
    this.group.add(lines);
    this.group.rotation.set(LEAN, 0, LEAN / 2);
    this.group.visible = false;
  }

  /** Its tone, the palette's. */
  paint(tone: Color): void {
    this.look.color.copy(tone);
  }

  /** Round `clump`, or none. */
  stand(clump: Clump | undefined): void {
    this.group.visible = clump !== undefined;
    if (clump === undefined) return;
    this.group.position.set(clump.centre.x, clump.centre.y, clump.centre.z);
    this.group.scale.setScalar(clump.radius);
  }

  dispose(): void {
    this.#geometry.dispose();
    this.look.dispose();
  }
}
