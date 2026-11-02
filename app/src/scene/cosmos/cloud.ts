// A cloud of points a look writes and a frame leaves alone: the worlds seen from afar and the belts' rocks share it. One draw, never culled
// by a stale sphere (the points come and go with each look), its attributes rewritten only from what changed.
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Points, type Object3D, type ShaderMaterial } from "three";
import type { Disposer } from "../disposer.ts";

export interface Cloud<Name extends string> {
  readonly geometry: BufferGeometry;
  readonly attributes: Readonly<Record<Name, BufferAttribute>>;
  /** Shows the first `count`. */
  commit(count: number): void;
}

/** Room for `most` vertices, each with `items` numbers in each named attribute, none shown yet. Its geometry is the caller's to free. */
export function cloudOf<Name extends string>(most: number, items: Readonly<Record<Name, number>>): Cloud<Name> {
  const geometry = new BufferGeometry();
  const names = Object.keys(items) as Name[];
  const attributes = Object.fromEntries(
    names.map((name) => {
      const attribute = new BufferAttribute(new Float32Array(most * items[name]), items[name]);
      attribute.setUsage(DynamicDrawUsage);
      geometry.setAttribute(name, attribute);
      return [name, attribute];
    }),
  ) as Record<Name, BufferAttribute>;
  geometry.setDrawRange(0, 0);
  return {
    geometry,
    attributes,
    commit: (count) => {
      geometry.setDrawRange(0, count);
      for (const name of names) attributes[name].needsUpdate = true;
    },
  };
}

/** A cloud of `most` points on `parent`, each with `items` numbers in each named attribute, drawn with `material`. */
export function pointCloud<Name extends string>(
  parent: Object3D,
  owner: Disposer,
  {
    most,
    items,
    material,
  }: { readonly most: number; readonly items: Readonly<Record<Name, number>>; readonly material: ShaderMaterial },
): Cloud<Name> {
  const cloud = cloudOf(most, items);
  owner.add(cloud.geometry);
  owner.add(material);
  const points = new Points(cloud.geometry, material);
  points.frustumCulled = false;
  parent.add(points);
  return cloud;
}
