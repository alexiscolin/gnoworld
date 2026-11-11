// The maps a group draws with: sent to the GPU before it shows, as its first draw would send them all in one frame.
import { Mesh, ShaderMaterial, Texture, type Object3D } from "three";

export function mapsOf(group: Object3D): Texture[] {
  const found = new Set<Texture>();
  const take = (value: unknown) => {
    if (value instanceof Texture) found.add(value as Texture);
  };
  group.traverse((part) => {
    const materials = part instanceof Mesh ? [part.material].flat() : [];
    for (const material of materials)
      if (material instanceof ShaderMaterial) for (const { value } of Object.values(material.uniforms)) take(value);
  });
  return [...found];
}
