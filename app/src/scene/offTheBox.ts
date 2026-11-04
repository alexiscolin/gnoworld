// A line kept off the box of the page's text (part 7x2), as a body is (cosmos/bodies.ts) and a name: where it runs under the box it fades
// out over a few pixels, never cut short. The box comes in the page's pixels at each draw; its program is one for every such line, three
// keying it by this one function's text (Material.js, customProgramCacheKey).
import type { ClearBox } from "@gnoworld/core";
import { Vector2, Vector4, type Material } from "three";

// How far in, in the page's pixels, a line under the box has faded out.
const SOFT = 20;
// The fragment's depth into the box, read first in its main, the box in the drawing buffer's pixels from the bottom left, none an empty
// box; its light faded by it last. The site's build strips the shaders' spaces (7v), so both are found with or without them.
const MAIN = /void\s*main\s*\(\s*\)\s*\{/;
const IN =
  "void main() {\n  vec2 offIn = min(gl_FragCoord.xy - offBox.xy, offBox.zw - gl_FragCoord.xy);\n" +
  "  float offFade = 1.0 - smoothstep(0.0, offSoft, min(offIn.x, offIn.y));";
const LAST = /#include\s*<dithering_fragment>/;
const OUT = "#include <dithering_fragment>\n  gl_FragColor.a *= offFade;";

/** Keeps what `material` draws, a transparent line's covering, off the box `box` gives at each draw, in the page's pixels; none, it draws
 * everywhere. */
export function offTheBox(material: Material, box: () => ClearBox | undefined): void {
  const kept = { value: new Vector4(0, 0, -1, -1) };
  const soft = { value: SOFT };
  const buffer = new Vector2();
  material.onBeforeCompile = (shader) => {
    shader.uniforms["offBox"] = kept;
    shader.uniforms["offSoft"] = soft;
    shader.fragmentShader =
      "uniform vec4 offBox;\nuniform float offSoft;\n" + shader.fragmentShader.replace(MAIN, IN).replace(LAST, OUT);
  };
  material.onBeforeRender = (renderer) => {
    const now = box();
    if (now === undefined) {
      kept.value.set(0, 0, -1, -1);
      return;
    }
    const ratio = renderer.getPixelRatio();
    const height = renderer.getDrawingBufferSize(buffer).y;
    soft.value = SOFT * ratio;
    kept.value.set(now.left * ratio, height - now.bottom * ratio, now.right * ratio, height - now.top * ratio);
  };
}
