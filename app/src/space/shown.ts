// What the scene is drawn from, as numbers (P102): each part's visibility, each uniform that is a number, a vector or a colour, each
// texture's and buffer's version. The clocks are left out: the slow motions they drive are judged by their pixels (redraw.ts).
import {
  BufferAttribute,
  type BufferGeometry,
  Color,
  Line,
  Material,
  Mesh,
  Points,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector3,
  Vector4,
  type Object3D,
} from "three";

// The clocks, the rings' clock, a planet's light direction (it turns with the orbit, a slow motion judged by its pixels, D13013: counted
// here it made every frame "full" and the loop never calm), and the dust's eye wrapped into its cell: it follows the camera, which the
// frame weighs by its pixels.
const CLOCKS = new Set(["uTime", "time", "cloudTime", "ringTime", "sun", "uEye"]);

function uniformsOf(material: ShaderMaterial, out: number[]): void {
  for (const [name, { value }] of Object.entries(material.uniforms)) {
    if (CLOCKS.has(name)) continue;
    if (typeof value === "number") out.push(value);
    else if (value instanceof Vector2) out.push(value.x, value.y);
    else if (value instanceof Vector3) out.push(value.x, value.y, value.z);
    else if (value instanceof Vector4) out.push(value.x, value.y, value.z, value.w);
    else if (value instanceof Color) out.push(value.r, value.g, value.b);
    else if (value instanceof Texture) out.push(value.version);
  }
}

type Drawn = Object3D & { readonly material: Material | Material[]; readonly geometry: BufferGeometry };
const isDrawn = (part: Object3D): part is Drawn =>
  part instanceof Mesh || part instanceof Points || part instanceof Line;

function partOf(part: Object3D, out: number[]): void {
  out.push(part.visible ? 1 : 0);
  if (!isDrawn(part)) return;
  const { material, geometry } = part;
  for (const each of Array.isArray(material) ? material : [material]) {
    if (!(each instanceof Material)) continue;
    out.push(each.opacity);
    if (each instanceof ShaderMaterial) uniformsOf(each, out);
  }
  for (const name of Object.keys(geometry.attributes)) {
    const buffer = geometry.getAttribute(name);
    out.push(buffer instanceof BufferAttribute ? buffer.version : buffer.data.version);
  }
  out.push(geometry.drawRange.count);
}

/** Appends the numbers `scene` is drawn from to `out`, and gives it back. */
export function shownOf(scene: Object3D, out: number[]): number[] {
  scene.traverse((part) => {
    partOf(part, out);
  });
  return out;
}
