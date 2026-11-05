import { MeshBasicMaterial, Vector2, type Material, type Vector4 } from "three";
import { describe, expect, it } from "vitest";
import { offTheBox, THIN } from "./offTheBox.ts";

// What keeps the scene off the page's text (7x2, 8m): the box in the drawing buffer's pixels at each draw, the room and band scaled by the
// pixel ratio, the field's code put in the fade's fragment or the thin's vertex shader, one program a way. The field's numbers are GLSL
// alone, which only a WebGL readback of a frame reads.
const BOX = { left: 100, top: 50, right: 300, bottom: 150 };
const BUFFER = { width: 800, height: 600 };

interface Compiled {
  uniforms: Record<string, { value: Vector4 | Vector2 }>;
  vertexShader: string;
  fragmentShader: string;
}
// The material's own hook, which the renderer calls with the material as its receiver.
const callHook = (material: Material, name: "onBeforeCompile" | "onBeforeRender", args: unknown[]): void => {
  const hook: unknown = Reflect.get(material, name);
  if (typeof hook !== "function") throw new Error(`the material has no ${name}`);
  Reflect.apply(hook, material, args);
};
const compile = (material: Material, vertex: string, fragment: string): Compiled => {
  const shader: Compiled = { uniforms: {}, vertexShader: vertex, fragmentShader: fragment };
  callHook(material, "onBeforeCompile", [shader, undefined]);
  return shader;
};
const draw = (material: Material, ratio: number) => {
  const renderer = {
    getPixelRatio: () => ratio,
    getDrawingBufferSize: (into: Vector2) => into.set(BUFFER.width, BUFFER.height),
  };
  callHook(material, "onBeforeRender", [renderer]);
};
const fieldOf = (shader: Compiled, name: string) => [...(shader.uniforms[name]?.value ?? [])];

describe("what the scene keeps off the box of the page's text", () => {
  it("hands the shader the box in the buffer's pixels, from the bottom left, and the room and band at the pixel ratio", () => {
    for (const ratio of [1, 2]) {
      const material = new MeshBasicMaterial();
      offTheBox(material, () => BOX);
      const shader = compile(material, "void main() {}", "void main() {}");
      draw(material, ratio);
      expect(fieldOf(shader, "offBox")).toEqual([
        BOX.left * ratio,
        BUFFER.height - BOX.bottom * ratio,
        BOX.right * ratio,
        BUFFER.height - BOX.top * ratio,
      ]);
      const [pad, band, round, cell] = fieldOf(shader, "offSoft");
      expect([pad, band, round, cell]).toEqual([16 * ratio, 112 * ratio, 48 * ratio, 96 * ratio]);
    }
  });

  it("draws everywhere, an empty box, with no box, and again once the box goes", () => {
    const material = new MeshBasicMaterial();
    let box: typeof BOX | undefined = BOX;
    offTheBox(material, () => box);
    const shader = compile(material, "", "");
    draw(material, 1);
    box = undefined;
    draw(material, 1);
    const [left = 0, , right = 0] = fieldOf(shader, "offBox");
    expect(right).toBeLessThan(left);
  });

  it("fades a line in its fragment shader, with the shaders' spaces stripped or not", () => {
    for (const [main, last] of [
      ["void main() {", "#include <dithering_fragment>"],
      ["void main(){", "#include<dithering_fragment>"],
    ] as const) {
      const material = new MeshBasicMaterial();
      offTheBox(material, () => BOX);
      const shader = compile(material, "void main(){}", `${main}\n${last}\n}`);
      expect(shader.fragmentShader).toContain("float offField(");
      expect(shader.fragmentShader).toContain("float offFade = offField(gl_FragCoord.xy, 0.0);");
      expect(shader.fragmentShader).toContain("gl_FragColor.a *= offFade;");
      expect(shader.vertexShader).toBe("void main(){}");
    }
  });

  it("gives the vertex shader the field to thin a mass's particles by, and leaves the fragment alone", () => {
    const material = new MeshBasicMaterial();
    offTheBox(material, () => BOX, "thin");
    const shader = compile(material, "void main() {}", "void main() {}");
    expect(shader.vertexShader.startsWith("uniform vec4 offBox;")).toBe(true);
    expect(shader.vertexShader).toContain("uniform vec2 offBuffer;");
    expect(shader.fragmentShader).toBe("void main() {}");
  });

  it("keeps one program for each way, apart from each other", () => {
    const [fade, thin] = [new MeshBasicMaterial(), new MeshBasicMaterial()];
    offTheBox(fade, () => BOX);
    offTheBox(thin, () => BOX, "thin");
    expect([fade.customProgramCacheKey(), thin.customProgramCacheKey()]).toEqual(["offTheBox:fade", "offTheBox:thin"]);
  });

  it("stands thin 72 px round the box: the room and half the band, where no pill stands", () => {
    expect(THIN).toBe(16 + 112 / 2);
  });
});
