import { Mesh, MeshStandardMaterial, PerspectiveCamera, Raycaster, Vector3, type Object3D } from "three";
import { describe, expect, it } from "vitest";
import { colonyOf, FAR_RADII } from "./colony.ts";
import { ANCHORS, ROOM_ANCHORS } from "./crown.ts";
import { hullMaps, SIZE } from "./hull.ts";

const meshesOf = (root: Object3D): Mesh[] => {
  const all: Mesh[] = [];
  root.traverse((each) => {
    if (each instanceof Mesh) all.push(each as Mesh);
  });
  return all;
};
const trianglesOf = (root: Object3D): number =>
  meshesOf(root).reduce((sum, mesh) => sum + mesh.geometry.getAttribute("position").count / 3, 0);

// A colony of its own for each test: none leaves a size or a level to the next.
const fresh = () => {
  const colony = colonyOf();
  colony.group.updateMatrixWorld(true);
  return colony;
};

describe("gnosh's colony, the offset crown (D13740)", () => {
  it("names a point of its hull for each of its rooms, #general, #help and #showcase, among more for the bubbles", () => {
    expect(ROOM_ANCHORS.map(({ room }) => room)).toEqual(["#gnosh-ai", "#gnosh-ai/help", "#gnosh-ai/showcase"]);
    for (const anchor of ROOM_ANCHORS) expect(ANCHORS).toContain(anchor);
    expect(ANCHORS.length).toBeGreaterThan(ROOM_ANCHORS.length + 1);
  });

  it("stands every sign on its hull, never in the void: a ray down each anchor's normal meets the hull at the anchor", () => {
    const colony = fresh();
    const [point, normal] = [new Vector3(), new Vector3()];
    const ray = new Raycaster();
    const size = colony.group.getWorldScale(new Vector3()).x;
    for (const at of ANCHORS.keys()) {
      colony.anchorAt(at, point, normal);
      ray.set(point.clone().addScaledVector(normal, 0.3 * size), normal.clone().negate());
      const [hit] = ray.intersectObject(colony.near, true);
      expect(hit?.distance, `anchor ${String(at)}`).toBeCloseTo(0.3 * size, 2);
    }
  });

  it("tells a point it stands in front of from one the eye sees clear", () => {
    const colony = fresh();
    const [point, normal] = [new Vector3(), new Vector3()];
    for (const at of [0, 1]) {
      colony.anchorAt(at, point, normal);
      expect(colony.blocks(point, point.clone().addScaledVector(normal, 10)), `anchor ${String(at)} seen`).toBe(false);
      expect(colony.blocks(point, point.clone().addScaledVector(normal, -10)), `anchor ${String(at)} behind`).toBe(true);
    }
  });

  // The hub's sign faces out along the wheel's plane: an eye far out that way looks at it through the wheel, which hides it, though its
  // face turns to the eye. Facing alone would show it.
  it("hides the hub's sign from an eye out past the wheel, the wheel standing between them", () => {
    const colony = fresh();
    const [point, normal] = [new Vector3(), new Vector3()];
    const showcase = ROOM_ANCHORS[2];
    if (showcase === undefined) throw new Error("no hub's anchor");
    const hub = ANCHORS.indexOf(showcase);
    colony.anchorAt(hub, point, normal);
    const eye = point.clone().addScaledVector(normal, 10);
    expect(normal.dot(eye.clone().sub(point))).toBeGreaterThan(0);
    expect(colony.blocks(point, eye)).toBe(true);
  });

  it("draws near its fine level and far its light one, each in eight draws at most, one a finish", () => {
    const colony = fresh();
    expect(colony.lod.levels.map(({ object }) => object)).toEqual([colony.near, colony.far]);
    expect(trianglesOf(colony.near)).toBeGreaterThan(3 * trianglesOf(colony.far));
    for (const level of [colony.near, colony.far]) expect(meshesOf(level).length).toBeLessThanOrEqual(8);
  });

  it("takes its light level past FAR_RADII of its own size, whatever size the view gives it", () => {
    const colony = fresh();
    const camera = new PerspectiveCamera();
    for (const scale of [1, 6]) {
      colony.group.scale.setScalar(scale);
      colony.group.updateMatrixWorld(true);
      const reach = colony.reach() * FAR_RADII;
      camera.position.set(0, 0, reach * 0.9);
      camera.updateMatrixWorld(true);
      colony.lod.update(camera);
      expect(colony.lod.getCurrentLevel(), `near, scale ${String(scale)}`).toBe(0);
      camera.position.set(0, 0, reach * 1.1);
      camera.updateMatrixWorld(true);
      colony.lod.update(camera);
      expect(colony.lod.getCurrentLevel(), `far, scale ${String(scale)}`).toBe(1);
    }
  });

  it("casts and takes the sun's shadows near, none far, where they could not be seen", () => {
    const colony = fresh();
    expect([meshesOf(colony.near).length, meshesOf(colony.far).length]).not.toContain(0);
    for (const mesh of meshesOf(colony.near)) expect([mesh.castShadow, mesh.receiveShadow]).toEqual([true, true]);
    for (const mesh of meshesOf(colony.far)) expect([mesh.castShadow, mesh.receiveShadow]).toEqual([false, false]);
  });

  it("lights its windows on its night side alone: the lit glass fades as its face turns to the sun", () => {
    const colony = fresh();
    const lit = meshesOf(colony.near)
      .map(({ material }) => material)
      .filter((material): material is MeshStandardMaterial => material instanceof MeshStandardMaterial)
      .filter(({ emissiveMap }) => emissiveMap !== null);
    expect(lit.length).toBeGreaterThan(0);
    for (const material of lit) {
      const shader = { fragmentShader: "a\n#include <emissivemap_fragment>\nb", vertexShader: "", uniforms: {} };
      material.onBeforeCompile(shader as never, undefined as never);
      expect(shader.fragmentShader).toContain("#include <emissivemap_fragment>");
      expect(shader.fragmentShader).toMatch(
        /totalEmissiveRadiance \*= smoothstep\([^;]*dot\(normal, directionalLights\[0\]\.direction\)\)/,
      );
      expect(material.customProgramCacheKey()).toBe("colony-night");
    }
  });
});

describe("the colony's hull, drawn in the code", () => {
  it("is drawn at 512 px (D13741): its plates, their normals and their roughness, the same for the same seed", () => {
    expect(SIZE).toBe(512);
    const [one, two] = [hullMaps(3), hullMaps(3)];
    for (const map of [one.map, one.normalMap, one.roughnessMap])
      expect([map.image.width, map.image.height]).toEqual([SIZE, SIZE]);
    expect(one.normalMap.image.data).toEqual(two.normalMap.image.data);
    expect(one.map.image.data).toEqual(two.map.image.data);
    expect(hullMaps(4).map.image.data).not.toEqual(one.map.image.data);
  });

  it("gives its normals unit length, so its plates' seams catch the light as metal does", () => {
    const data = hullMaps(5).normalMap.image.data ?? new Uint8Array();
    expect(data.length).toBe(4 * SIZE * SIZE);
    for (let at = 0; at < data.length; at += 4 * 997) {
      const [x, y, z] = [data[at] ?? 0, data[at + 1] ?? 0, data[at + 2] ?? 0].map((byte) => (byte / 255) * 2 - 1);
      expect(Math.hypot(x ?? 0, y ?? 0, z ?? 0)).toBeCloseTo(1, 1);
    }
  });

  it("glazes a band of the habitat, its windows lit behind it, and nothing outside the band", () => {
    const { emissiveMap } = hullMaps(7, [0.25, 0.5]);
    const { width, height } = emissiveMap?.image ?? { width: 0, height: 0 };
    const data = emissiveMap?.image.data ?? new Uint8Array();
    const lit = (row: number) => {
      let sum = 0;
      for (let x = 0; x < width; x += 1) sum += data[(row * width + x) * 4] ?? 0;
      return sum;
    };
    expect(lit(Math.round(height * 0.1))).toBe(0);
    expect(lit(Math.round(height * 0.375))).toBeGreaterThan(0);
    expect(lit(Math.round(height * 0.8))).toBe(0);
  });
});

describe("the colony framed close on its page", () => {
  const look = { lean: 0, tilt: 0 } as never;

  // Its page stands it beside the plate, not larger than the window (placeFrame.tsx); wider than its sphere, it stands smaller there,
  // whole (the preview's), and eases there and back: nothing jumps.
  it("stands at 0.7 of its size framed close, easing there and back, and tells its hull's share", async () => {
    const { ColonyBody } = await import("./gnoshColony.ts");
    const body = new ColonyBody(look);
    body.setClose(1);
    const first = body.hull.scale;
    expect(first).toBeLessThan(1);
    expect(first).toBeGreaterThan(0.9);
    for (let frame = 0; frame < 200; frame += 1) body.setClose(1);
    expect(body.hull.scale).toBeCloseTo(0.7, 2);
    for (let frame = 0; frame < 200; frame += 1) body.setClose(0);
    expect(body.hull.scale).toBeCloseTo(1, 2);
    body.dispose();
  });
});
