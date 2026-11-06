import type { Rock } from "@gnoworld/core";
import { Group, type InstancedBufferAttribute } from "three";
import { describe, expect, it, vi } from "vitest";
import { Rocks } from "./rocks.ts";

// The home's rocks on the stage (7p; Alexis, 2026-11-03, "roches d'ambiance"): decor laid in space by the view at rest, drawn in one draw
// among the bodies, from the eye, so they slide with it, each lit the way it was laid.
const laid = (count: number): Rock[] =>
  Array.from({ length: count }, (_, at) => ({
    place: { x: at, y: 2 - at, z: 10 + at },
    toStar: { x: 0, y: 0.6, z: -0.8 },
    radius: 0.1 + at * 0.05,
    shade: at / 10,
    turn: at / 7,
  }));
const made = () => {
  const parent = new Group();
  const rocks = new Rocks(parent);
  return { parent, rocks, mesh: rocks.mesh };
};
const atOf = ({ mesh }: ReturnType<typeof made>, index: number) => {
  const at = mesh.geometry.getAttribute("aAt") as InstancedBufferAttribute;
  return { x: at.getX(index), y: at.getY(index), z: at.getZ(index) };
};

describe("the home's rocks on the stage", () => {
  it("draws every rock it is laid in one draw among the bodies, over what is behind, writing no depth", () => {
    const scene = made();
    scene.rocks.lay(laid(3));
    expect(scene.parent.children).toHaveLength(1);
    expect(scene.mesh.visible).toBe(true);
    expect(scene.mesh.geometry.instanceCount).toBe(3);
    expect(scene.mesh.material).toMatchObject({ transparent: true, depthWrite: false });
  });

  it("stands each where it is in space from the eye, and slides back as the eye moves, lit the way it was laid", () => {
    const scene = made();
    const rocks = laid(3);
    scene.rocks.lay(rocks);
    const eye = { x: 1, y: 2, z: 3 };
    scene.rocks.tick(eye);
    rocks.forEach(({ place }, index) => {
      const [stage, at] = [place, atOf(scene, index)];
      expect(at.x).toBeCloseTo(stage.x - eye.x, 2);
      expect(at.y).toBeCloseTo(stage.y - eye.y, 2);
      expect(at.z).toBeCloseTo(stage.z - eye.z, 2);
    });
    const first = atOf(scene, 0);
    scene.rocks.tick({ x: eye.x + 0.5, y: eye.y, z: eye.z });
    expect(atOf(scene, 0).x).toBeCloseTo(first.x - 0.5, 2);
    const light = scene.mesh.geometry.getAttribute("aLight") as InstancedBufferAttribute;
    expect([light.getX(1), light.getY(1), light.getZ(1)].map((value) => Number(value.toFixed(3)))).toEqual([
      0, 0.6, -0.8,
    ]);
  });

  it("writes each rock's size, shade and turn, drawn after the bodies and never culled by a stale sphere", () => {
    const scene = made();
    scene.rocks.lay(laid(3));
    const rock = scene.mesh.geometry.getAttribute("aRock") as InstancedBufferAttribute;
    expect([rock.getX(2), rock.getY(2), rock.getZ(2)].map((value) => Number(value.toFixed(4)))).toEqual([
      0.2,
      0.2,
      Number((2 / 7).toFixed(4)),
    ]);
    expect(scene.mesh.renderOrder).toBeGreaterThan(0);
    expect(scene.mesh.frustumCulled).toBe(false);
  });

  // Reduced motion stands the eye still: so do the rocks, which move with nothing else.
  it("keeps each rock where it stood while the eye stands still", () => {
    const scene = made();
    scene.rocks.lay(laid(3));
    const eye = { x: 0.5, y: -1, z: 2 };
    scene.rocks.tick(eye);
    const before = [0, 1, 2].map((index) => atOf(scene, index));
    scene.rocks.tick({ ...eye });
    expect([0, 1, 2].map((index) => atOf(scene, index))).toEqual(before);
  });

  it("draws nothing when laid none, and eight at most", () => {
    const scene = made();
    scene.rocks.lay(laid(12));
    expect(scene.mesh.geometry.instanceCount).toBe(8);
    scene.rocks.lay([]);
    expect(scene.mesh.geometry.instanceCount).toBe(0);
    expect(scene.mesh.visible).toBe(false);
  });

  it("leaves the stage, its buffers and program freed", () => {
    const scene = made();
    const [geometry, material] = [vi.spyOn(scene.mesh.geometry, "dispose"), vi.spyOn(scene.mesh.material, "dispose")];
    scene.rocks.dispose();
    expect(scene.parent.children).toHaveLength(0);
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
  });
});
