// What the scene draws kept off the box of the page's text (parts 7x2 and 8m), as a body is (cosmos/bodies.ts) and a name: a field that is
// nothing a few pixels round the text and grows to whole over a wide band past them, its corners round and its edge stirred by slow waves,
// so what stands near the text thins out softly, never cut along a straight edge. A line fades by it; the mass's particles go by it, one by
// one (cosmos/webLook.ts). The box comes in the page's pixels at each draw; its program is one for every such material, three keying it by
// this one function's text (Material.js, customProgramCacheKey) and by the way it is kept.
import type { ClearBox } from "@gnoworld/core";
import { Vector2, Vector4, type Material } from "three";

// In the page's pixels: the room left clear round the text, the band over which the field grows whole, its corners' round, and the
// waves' length, which move the band's start by up to half its width, so no edge of it runs straight.
const PAD = 16;
const BAND = 112;
const ROUND = 48;
const CELL = 96;
/** How far round the box, in the page's pixels, the field stands thin: no clump's name stands nearer (cosmos/webNames.ts). */
export const THIN = PAD + BAND / 2;
// The field, in the drawing buffer's pixels from the bottom left, at `at` for a thing that reaches `reach` round it: 0 within the room round
// the box, 1 past its band; 1 everywhere for an empty box. The site's build strips the shaders' spaces (7v), so `main` and the last include
// are found with or without them.
const FIELD = `uniform vec4 offBox;
uniform vec4 offSoft;
uniform vec2 offBuffer;
float offField(vec2 at, float reach) {
  if (offBox.z < offBox.x) return 1.0;
  vec2 side = (offBox.zw - offBox.xy) * 0.5 + offSoft.x - offSoft.z;
  vec2 q = abs(at - (offBox.xy + offBox.zw) * 0.5) - side;
  float beyond = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - offSoft.z - reach;
  vec2 p = at / offSoft.w;
  return smoothstep(0.0, offSoft.y, beyond - offSoft.y * (0.25 + 0.125 * (sin(p.x + 1.7 * sin(p.y)) + sin(1.3 * p.y - p.x))));
}
`;
const MAIN = /void\s*main\s*\(\s*\)\s*\{/;
const IN = "void main() {\n  float offFade = offField(gl_FragCoord.xy, 0.0);";
const LAST = /#include\s*<dithering_fragment>/;
const OUT = "#include <dithering_fragment>\n  gl_FragColor.a *= offFade;";

/** Keeps what `material` draws off the box `box` gives at each draw, in the page's pixels; none, it draws everywhere. `fade`: a transparent
 * line's covering fades by the field. `thin`: its vertex shader is given `offField(at, reach)` and `offBuffer`, the drawing buffer's size,
 * and keeps itself off (the mass's particles). */
export function offTheBox(material: Material, box: () => ClearBox | undefined, how: "fade" | "thin" = "fade"): void {
  const kept = { value: new Vector4(0, 0, -1, -1) };
  const soft = { value: new Vector4(PAD, BAND, ROUND, CELL) };
  const buffer = { value: new Vector2() };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { offBox: kept, offSoft: soft, offBuffer: buffer });
    if (how === "thin") shader.vertexShader = FIELD + shader.vertexShader;
    else shader.fragmentShader = FIELD + shader.fragmentShader.replace(MAIN, IN).replace(LAST, OUT);
  };
  material.customProgramCacheKey = () => `offTheBox:${how}`;
  material.onBeforeRender = (renderer) => {
    const now = box();
    if (now === undefined) {
      kept.value.set(0, 0, -1, -1);
      return;
    }
    const ratio = renderer.getPixelRatio();
    const height = renderer.getDrawingBufferSize(buffer.value).y;
    soft.value.set(PAD, BAND, ROUND, CELL).multiplyScalar(ratio);
    kept.value.set(now.left * ratio, height - now.bottom * ratio, now.right * ratio, height - now.top * ratio);
  };
}
