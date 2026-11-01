// The plate, painted a second time, in the canvas: the canvas is opaque and lies under the page, so the plate opens a circle for the globe, and
// what shows in that circle must be the plate again, or the ring glows on black where frame 39 has it on navy. One draw, before everything.
import {
  CustomBlending,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  Vector4,
} from "three";

/** The plate on the page, in its pixels; its fill in sRGB bytes. */
export interface PlateGround {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly fill: readonly [number, number, number];
}

const BYTE = 255;
const BEFORE_ALL = -1;

const VERTEX = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

// The page's own colours, written as they are: no grade, for the plate is not in the scene's light. Its fade and dots are the stylesheet's.
const FRAGMENT = /* glsl */ `
uniform vec4 plate;
uniform vec3 fill;
uniform float pageHeight;
uniform float ratio;
const vec3 INK = vec3(0.957, 0.965, 0.98);
void main() {
  vec2 at = vec2(gl_FragCoord.x / ratio, pageHeight - gl_FragCoord.y / ratio);
  if (at.x < plate.x || at.x > plate.z || at.y < plate.y || at.y > plate.w) discard;
  float kept = clamp((plate.z - at.x) / 64.0, 0.0, 1.0);
  vec2 tile = mod(at - plate.xy, 14.0) - 7.0;
  vec3 colour = mix(fill, INK, 0.07 * (1.0 - smoothstep(1.0, 1.3, length(tile))));
  gl_FragColor = vec4(colour * kept, kept);
}
`;

export class Ground {
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;

  constructor() {
    this.mesh = new Mesh(
      new PlaneGeometry(2, 2),
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        depthTest: false,
        depthWrite: false,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
        uniforms: {
          plate: { value: new Vector4() },
          fill: { value: new Vector3() },
          pageHeight: { value: 1 },
          ratio: { value: 1 },
        },
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = BEFORE_ALL;
    this.mesh.visible = false;
  }

  #uniform(name: string) {
    const uniform = this.mesh.material.uniforms[name];
    if (uniform === undefined) throw new Error(`no uniform ${name}`);
    return uniform;
  }

  /** Paints `plate`, or nothing where the page keeps none beside the globe. */
  show(plate: PlateGround | undefined): void {
    this.mesh.visible = plate !== undefined;
    if (plate === undefined) return;
    const { left, top, right, bottom, fill } = plate;
    (this.#uniform("plate").value as Vector4).set(left, top, right, bottom);
    (this.#uniform("fill").value as Vector3).set(fill[0] / BYTE, fill[1] / BYTE, fill[2] / BYTE);
  }

  /** The page's height and the buffer's pixels to one of the page's. */
  resize(height: number, ratio: number): void {
    this.#uniform("pageHeight").value = height;
    this.#uniform("ratio").value = ratio;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
