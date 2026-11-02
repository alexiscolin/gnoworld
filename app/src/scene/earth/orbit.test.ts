import { Group, Mesh, Vector3, type BufferAttribute, type BufferGeometry, type ShaderMaterial } from "three";
import { describe, expect, it } from "vitest";
import { createOrbit, MOON_REST, ORBIT_RADIUS } from "./orbit.ts";
import { ORBIT_FRAGMENT, ORBIT_VERTEX } from "./orbitShader.ts";

describe("the golden ring", () => {
  it("is a tilted orbit, never the flat ring: it neither faces the eye nor lies edge on", () => {
    const orbit = createOrbit();
    orbit.group.updateMatrixWorld();
    const normal = new Vector3(0, 1, 0).applyQuaternion(orbit.group.quaternion);
    const facing = Math.abs(normal.z);
    expect(facing).toBeGreaterThan(0.2);
    expect(facing).toBeLessThan(0.95);
    orbit.dispose();
  });

  it("passes behind the globe and in front of it", () => {
    const orbit = createOrbit();
    const deep = [0, 1, 2, 3].map((quarter) => orbit.moonAt(MOON_REST + (quarter * Math.PI) / 2, new Vector3()).z);
    expect(Math.max(...deep)).toBeGreaterThan(0.2);
    expect(Math.min(...deep)).toBeLessThan(-0.2);
    orbit.dispose();
  });

  it("draws its tube on the Moon's path, and around it", () => {
    const orbit = createOrbit();
    const line = orbit.group.children.find((part): part is Mesh => part instanceof Mesh);
    const { position } = line?.geometry.attributes as { position: BufferAttribute };
    for (let at = 0; at < position.count; at += 97) {
      const point = new Vector3().fromBufferAttribute(position, at);
      const onPath = new Vector3(point.x, 0, point.z).setLength(ORBIT_RADIUS);
      expect(point.distanceTo(onPath)).toBeLessThan(0.1);
    }
    orbit.dispose();
  });

  it("rests its Moon on the front half", () => {
    const orbit = createOrbit();
    expect(orbit.moonAt(MOON_REST, new Vector3()).z).toBeGreaterThan(0);
    orbit.dispose();
  });

  it("keeps the Moon on the ring at every angle, clear of the globe", () => {
    const orbit = createOrbit();
    for (let angle = 0; angle < 6.3; angle += 0.5) {
      expect(orbit.moonAt(angle, new Vector3()).length()).toBeCloseTo(ORBIT_RADIUS, 6);
      expect(orbit.moonAt(angle, new Vector3()).length()).toBeGreaterThan(1.05);
    }
    orbit.dispose();
  });

  it("frees each of its meshes' geometry and material", () => {
    const orbit = createOrbit();
    let meshes = 0;
    let freed = 0;
    const count = () => {
      freed += 1;
    };
    orbit.group.traverse((part) => {
      if (part instanceof Mesh) {
        meshes += 1;
        (part.geometry as BufferGeometry).addEventListener("dispose", count);
        (part.material as ShaderMaterial).addEventListener("dispose", count);
      }
    });
    orbit.dispose();
    expect(meshes).toBeGreaterThan(0);
    expect(freed).toBe(meshes * 2);
  });

  it("carries no state: no source says what a share of it would mean, so it has no arc, no threshold and no pill", () => {
    const orbit = createOrbit();
    const line = orbit.group.children.find((part): part is Mesh => part instanceof Mesh);
    expect(Object.keys((line?.material as ShaderMaterial).uniforms)).toEqual(["head"]);
    expect(ORBIT_FRAGMENT).not.toMatch(/progress|threshold|share/);
    orbit.dispose();
  });

  it("goes behind the globe and over its air: tested against depth, writing none", () => {
    const orbit = createOrbit();
    const line = orbit.group.children.find((part): part is Mesh => part instanceof Mesh);
    const material = line?.material as ShaderMaterial;
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(line?.renderOrder).toBeGreaterThan(1);
    orbit.dispose();
  });

  it("hands the shader the Moon's angle, for its wake", () => {
    const orbit = createOrbit();
    orbit.setHead(1.2);
    const line = orbit.group.children.find((part): part is Mesh => part instanceof Mesh);
    expect((line?.material as ShaderMaterial).uniforms["head"]?.value).toBe(1.2);
    orbit.dispose();
  });

  it("goes through the image's one grade, like everything drawn", () => {
    expect(ORBIT_VERTEX).toContain("gl_Position");
    expect(ORBIT_FRAGMENT).toContain("#include <tonemapping_fragment>");
    expect(ORBIT_FRAGMENT).toContain("#include <colorspace_fragment>");
  });
});

describe("the ring of an Earth among the worlds (f0004)", () => {
  const fine = () => {
    const orbit = createOrbit();
    orbit.setFine(new Group());
    return orbit;
  };
  const reach = (orbit: ReturnType<typeof createOrbit>) => {
    const points = Array.from({ length: 180 }, (_, at) => orbit.moonAt((at * Math.PI) / 90, new Vector3()));
    const flat = points.map(({ x, y }) => Math.hypot(x, y));
    return { widest: Math.max(...flat), narrowest: Math.min(...flat) };
  };

  it("is a wide ellipse, about 1.9 radii by 1.1, standing away from the disc", () => {
    const { widest, narrowest } = reach(fine());
    expect(widest).toBeCloseTo(1.9, 1);
    expect(narrowest).toBeCloseTo(1.1, 1);
  });

  it("wears no halo round its Moon", () => {
    expect(fine().glow.visible).toBe(false);
  });

  it("takes the line it is given in place of its tube", () => {
    const orbit = createOrbit();
    const line = new Group();
    orbit.setFine(line);
    expect(orbit.group.children.filter(({ visible }) => visible)).toEqual([line]);
  });

  it("leaves the Earth's own ring as approved until it is asked", () => {
    const orbit = createOrbit();
    expect(orbit.glow.visible).toBe(true);
    expect(orbit.moonAt(0.4, new Vector3()).length()).toBeCloseTo(ORBIT_RADIUS, 6);
  });
});
