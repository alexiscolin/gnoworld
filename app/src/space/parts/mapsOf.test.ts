import { DataTexture, Mesh, MeshStandardMaterial, SphereGeometry, Group } from "three";
import { describe, expect, it } from "vitest";
import { mapsOf } from "./mapsOf.ts";

describe("the maps a group draws with", () => {
  // A lit material's maps (gnosh's colony's hull) go to the GPU one a frame before it shows, as a shader's uniforms do.
  it("takes a lit material's own maps too, each once", () => {
    const [map, normalMap] = [new DataTexture(), new DataTexture()];
    const group = new Group();
    const material = new MeshStandardMaterial({ map, normalMap, roughnessMap: map });
    group.add(new Mesh(new SphereGeometry(), material), new Mesh(new SphereGeometry(), material));
    expect(new Set(mapsOf(group))).toEqual(new Set([map, normalMap]));
  });
});
