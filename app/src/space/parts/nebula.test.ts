import { MeshBasicMaterial, type WebGLCubeRenderTarget, type WebGLRenderer } from "three";
import { describe, expect, it, vi } from "vitest";
import { nebulaOf } from "./nebula.ts";

const world = (half = true) => {
  const known = new Set<object>();
  const state = { lost: false };
  const renderer = {
    extensions: { has: (name: string) => half && name === "EXT_color_buffer_float" },
    properties: { has: (texture: object) => known.has(texture) },
    getContext: () => ({ isContextLost: () => state.lost }),
  } as unknown as WebGLRenderer;
  const bake = vi.fn((): WebGLCubeRenderTarget => {
    const target = { texture: {}, dispose: vi.fn() } as unknown as WebGLCubeRenderTarget;
    known.add(target.texture);
    return target;
  });
  const mesh = nebulaOf({}, bake);
  const frame = () => {
    mesh.onBeforeRender(
      renderer,
      undefined as never,
      undefined as never,
      undefined as never,
      new MeshBasicMaterial(),
      undefined as never,
    );
  };
  return { bake, frame, known, state, mesh };
};

describe("nebula bake", () => {
  it("bakes once, draws live until then, then reads the cube", () => {
    const { bake, frame, mesh } = world();
    const live = mesh.material;
    frame();
    frame();
    expect(bake).toHaveBeenCalledTimes(1);
    expect(mesh.material).not.toBe(live);
  });

  it("bakes again when the context came back (the cube is not in the new one)", () => {
    const { bake, frame, known } = world();
    frame();
    known.clear();
    frame();
    expect(bake).toHaveBeenCalledTimes(2);
  });

  it("does not bake while the context is lost", () => {
    const { bake, frame, state } = world();
    state.lost = true;
    frame();
    expect(bake).not.toHaveBeenCalled();
  });

  it("keeps the live shader where half floats cannot be drawn to", () => {
    const { bake, frame, mesh } = world(false);
    const live = mesh.material;
    frame();
    expect(bake).not.toHaveBeenCalled();
    expect(mesh.material).toBe(live);
  });
});
