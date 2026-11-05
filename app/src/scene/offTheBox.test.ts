import { LineBasicMaterial, PointsMaterial, Vector2, Vector4, type WebGLRenderer } from "three";
import { describe, expect, it } from "vitest";
import { offTheBox } from "./offTheBox.ts";

// A renderer as the material's hooks read it: its pixel ratio and its drawing buffer's size.
const rendererOf = (ratio: number, width: number, height: number) =>
  ({
    getPixelRatio: () => ratio,
    getDrawingBufferSize: (into: Vector2) => into.set(width, height),
  }) as unknown as WebGLRenderer;

// The material's program as three hands it to `onBeforeCompile`: its shaders' text and its uniforms.
const shaderOf = (vertexShader: string, fragmentShader: string) => ({
  vertexShader,
  fragmentShader,
  uniforms: {} as Record<string, { value: unknown }>,
});

const drawn = (material: LineBasicMaterial | PointsMaterial, renderer: WebGLRenderer) => {
  const hook = material.onBeforeRender.bind(material) as unknown as (renderer: WebGLRenderer) => void;
  hook(renderer);
};

const FRAGMENT =
  "uniform vec3 diffuse;\nvoid main() {\n  gl_FragColor = vec4(diffuse, 1.0);\n  #include <dithering_fragment>\n}";
const STRIPPED = "uniform vec3 diffuse;void main(){gl_FragColor=vec4(diffuse,1.0);\n#include<dithering_fragment>\n}";

describe("offTheBox", () => {
  it("hands the shader the page's box in the drawing buffer's pixels from the bottom left, and its sizes at the pixel ratio", () => {
    const material = new LineBasicMaterial();
    offTheBox(material, () => ({ left: 100, top: 50, right: 400, bottom: 250 }));
    const shader = shaderOf("void main() {}", FRAGMENT);
    material.onBeforeCompile(shader as never, rendererOf(2, 1600, 1000));
    drawn(material, rendererOf(2, 1600, 1000));
    expect(shader.uniforms["offBox"]?.value).toEqual(new Vector4(200, 500, 800, 900));
    expect(shader.uniforms["offSoft"]?.value).toEqual(new Vector4(32, 224, 96, 192));
    expect(shader.uniforms["offBuffer"]?.value).toEqual(new Vector2(1600, 1000));
  });

  it("follows the box as it changes, and draws everywhere once there is none", () => {
    let box: { left: number; top: number; right: number; bottom: number } | undefined = {
      left: 0,
      top: 0,
      right: 10,
      bottom: 10,
    };
    const material = new LineBasicMaterial();
    offTheBox(material, () => box);
    const shader = shaderOf("void main() {}", FRAGMENT);
    material.onBeforeCompile(shader as never, rendererOf(1, 100, 100));
    drawn(material, rendererOf(1, 100, 100));
    expect(shader.uniforms["offBox"]?.value).toEqual(new Vector4(0, 90, 10, 100));
    box = { left: 20, top: 30, right: 60, bottom: 70 };
    drawn(material, rendererOf(1, 100, 100));
    expect(shader.uniforms["offBox"]?.value).toEqual(new Vector4(20, 30, 60, 70));
    box = undefined;
    drawn(material, rendererOf(1, 100, 100));
    // An empty box (right before left) is the field's "whole everywhere".
    expect(shader.uniforms["offBox"]?.value).toEqual(new Vector4(0, 0, -1, -1));
  });

  it.each([
    ["as three writes it", FRAGMENT],
    ["stripped of its spaces, as the site's build ships it", STRIPPED],
  ])("fades a line's covering by the field, its shader %s", (_, fragment) => {
    const material = new LineBasicMaterial();
    offTheBox(material, () => undefined);
    const shader = shaderOf("void main() {}", fragment);
    material.onBeforeCompile(shader as never, rendererOf(1, 1, 1));
    expect(shader.fragmentShader).toContain("float offField(vec2 at, float reach)");
    expect(shader.fragmentShader).toContain("float offFade = offField(gl_FragCoord.xy, 0.0);");
    expect(shader.fragmentShader.indexOf("offFade = ")).toBeGreaterThan(shader.fragmentShader.indexOf("void main"));
    expect(shader.fragmentShader).toMatch(/#include <dithering_fragment>\n {2}gl_FragColor\.a \*= offFade;\n}$/);
    expect(shader.vertexShader).toBe("void main() {}");
    expect(material.customProgramCacheKey()).toBe("offTheBox:fade");
  });

  it("gives the mass's vertex shader the field to keep each particle off by itself, its fragment untouched", () => {
    const material = new PointsMaterial();
    offTheBox(material, () => undefined, "thin");
    const shader = shaderOf("void main() { gl_PointSize = 1.0; }", FRAGMENT);
    material.onBeforeCompile(shader as never, rendererOf(1, 1, 1));
    expect(shader.vertexShader).toMatch(
      /^uniform vec4 offBox;[\s\S]*float offField\(vec2 at, float reach\)[\s\S]*void main\(\)/,
    );
    expect(shader.fragmentShader).toBe(FRAGMENT);
    expect(material.customProgramCacheKey()).toBe("offTheBox:thin");
  });

  // The field, as shipped: its text pinned here, so any change to it is read again beside this transcription, which checks what the field
  // promises in the page's pixels (8m): nothing within 16 px of the text, whole past the band and its waves, round corners, a particle's
  // reach taken off, and whole everywhere with no box.
  it("keeps nothing within 16 px of the text and everything past the band and its waves", () => {
    const material = new PointsMaterial();
    offTheBox(material, () => undefined, "thin");
    const shader = shaderOf("void main() {}", FRAGMENT);
    material.onBeforeCompile(shader as never, rendererOf(1, 1, 1));
    expect(shader.vertexShader.slice(0, shader.vertexShader.indexOf("void main"))).toBe(SHIPPED);
    const smooth = (edge: number, x: number) => {
      const t = Math.min(1, Math.max(0, x / edge));
      return t * t * (3 - 2 * t);
    };
    // offField(at, reach) at PAD 16, BAND 112, ROUND 48, CELL 96, for the box 100..500 across, 200..400 up.
    const field = (x: number, y: number, reach = 0) => {
      const [half, round] = [[200 + 16 - 48, 100 + 16 - 48], 48];
      const q = [Math.abs(x - 300) - (half[0] ?? 0), Math.abs(y - 300) - (half[1] ?? 0)] as const;
      const beyond =
        Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0)) + Math.min(Math.max(q[0], q[1]), 0) - round - reach;
      const [px, py] = [x / 96, y / 96];
      return smooth(112, beyond - 112 * (0.25 + 0.125 * (Math.sin(px + 1.7 * Math.sin(py)) + Math.sin(1.3 * py - px))));
    };
    // Along the box's straight sides (the corners' round starts 48 - 16 px in from each end).
    for (let along = 132; along <= 468; along += 7) {
      expect(field(along, 300)).toBe(0);
      expect(field(along, 400 + 16)).toBe(0);
      expect(field(along, 400 + 16 + 112 * 1.5 + 1)).toBe(1);
      expect(field(along, 200 - 16 - 112 * 1.5 - 1)).toBe(1);
    }
    // At a corner the round brings the field's start to 3 px of the text's corner (8n's low, F5466): 16 px out on the diagonal it may have begun.
    expect(field(500 + 2, 400 + 2)).toBe(0);
    expect(field(500 + 16 / Math.SQRT2, 400 + 16 / Math.SQRT2)).toBeLessThan(0.05);
    expect(field(500 + 16 + 112 * 1.5, 300)).toBe(1);
    expect(field(500 + 16 + 112 * 1.5, 300, 40)).toBeLessThan(1);
  });
});

const SHIPPED = `uniform vec4 offBox;
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
