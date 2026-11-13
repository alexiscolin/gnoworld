import { GLYPHS } from "./glyphs.tsx";
import type { IconName } from "./Icon.tsx";

/** An icon drawn inside another drawing, centred at a point, `size` wide, its stroke the icon's own 1.5 whatever the scale; it takes the ink
 * of the drawing around it. */
export function GlyphAt({ name, x, y, size }: { name: IconName; x: number; y: number; size: number }) {
  return (
    <g
      transform={`translate(${String(x - size / 2)} ${String(y - size / 2)}) scale(${String(size / 16)})`}
      strokeWidth={(1.5 * 16) / size}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {GLYPHS[name]}
    </g>
  );
}
