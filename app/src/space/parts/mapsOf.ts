// The maps a group draws with: sent to the GPU before it shows, as its first draw would send them all in one frame.
import { Mesh, ShaderMaterial, Texture, type Material, type Object3D } from "three";

// What a material holds that may be a map: a shader's are its uniforms, a lit material's (gnosh's colony's) its own fields.
const heldBy = (material: Material): unknown[] =>
  material instanceof ShaderMaterial
    ? Object.values(material.uniforms).map((each): unknown => each.value)
    : Object.values(material as unknown as Record<string, unknown>);

export function mapsOf(group: Object3D): Texture[] {
  const found = new Set<Texture>();
  group.traverse((part) => {
    const materials = part instanceof Mesh ? [part.material as Material | Material[]].flat() : [];
    for (const material of materials)
      for (const value of heldBy(material)) if (value instanceof Texture) found.add(value as Texture);
  });
  return [...found];
}
