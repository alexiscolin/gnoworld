import { Mesh, PerspectiveCamera, Scene, ShaderMaterial, type Object3D } from "three";
import { describe, expect, it, vi } from "vitest";
import { GENERATED_FRAGMENT } from "../planet/generatedShader.ts";
import { SURFACE_FRAGMENT } from "../planet/surfaceShader.ts";
import { programsAtRest, warmPrograms } from "./programs.ts";

// What a shader is: a surface, whole, or a moon's, which its own head precedes and whose source starts as the surface's did up to where
// the two surfaces part (moonLook.ts patches only its end); else one of the parts.
const HEAD = "uniform float moonAlpha, moonFlare;\n";
let PARTS_AT = 0;
while (GENERATED_FRAGMENT[PARTS_AT] === SURFACE_FRAGMENT[PARTS_AT]) PARTS_AT += 1;
const kindOf = (shader: string): string => {
  if (shader === GENERATED_FRAGMENT) return "generated";
  if (shader === SURFACE_FRAGMENT) return "hand-made";
  const moon = shader.startsWith(HEAD) ? shader.slice(HEAD.length) : undefined;
  if (moon?.startsWith(GENERATED_FRAGMENT.slice(0, PARTS_AT + 200)) === true) return "moon generated";
  if (moon?.startsWith(SURFACE_FRAGMENT.slice(0, PARTS_AT + 200)) === true) return "moon hand-made";
  return `part ${String(shader.length)}`;
};

// A renderer that records, for each compile, every material of the tree: its shader, whether it is transparent, whether the blur's kind
// of target was set (rig/blurred.ts), and whether the scene compiled against is the stage's.
function renderer(stage: Scene) {
  const made = new Set<string>();
  let target: unknown = null;
  const gl = {
    getContext: () => ({ getContextAttributes: () => ({ antialias: false }) }),
    getRenderTarget: () => target,
    setRenderTarget: (next: unknown) => {
      target = next;
    },
    compile: vi.fn((root: Object3D, _camera: unknown, scene: unknown) => {
      root.traverse((part) => {
        if (!(part instanceof Mesh) || !(part.material instanceof ShaderMaterial)) return;
        const { fragmentShader, transparent } = part.material;
        const where = `${target === null ? "screen" : "blur"}${scene === stage ? "" : " elsewhere"}`;
        made.add(`${kindOf(fragmentShader)} ${transparent ? "coming" : "opaque"} ${where}`);
      });
    }),
  };
  return { gl, made };
}

const warmed = () => {
  const stage = new Scene();
  const { gl, made } = renderer(stage);
  warmPrograms({ renderer: gl as never, camera: new PerspectiveCamera(), stage });
  return { gl, made, stage };
};

describe("warmPrograms", () => {
  it("makes a world's and the Earth's surfaces, opaque and coming in, on screen and in the blur, against the stage's scene", () => {
    const { made } = warmed();
    for (const surface of ["generated", "hand-made"])
      for (const state of ["opaque", "coming"])
        for (const where of ["screen", "blur"]) expect(made).toContain(`${surface} ${state} ${where}`);
    expect([...made].filter((one) => one.includes("elsewhere"))).toEqual([]);
  });

  it("makes both kinds of moon, whose surfaces their own head changes (the Moon's and a room's), on screen and in the blur", () => {
    const { made } = warmed();
    for (const moon of ["moon generated", "moon hand-made"])
      for (const where of ["screen", "blur"]) expect(made).toContain(`${moon} coming ${where}`);
  });

  it("makes the air, the glow and the rings, on screen and in the blur", () => {
    const { made } = warmed();
    for (const where of ["screen", "blur"]) {
      const parts = new Set(
        [...made].filter((one) => one.startsWith("part") && one.endsWith(where)).map((one) => one.split(" ")[1]),
      );
      expect(parts.size, where).toBeGreaterThanOrEqual(3);
    }
  });

  it("makes them once a renderer", () => {
    const { gl, stage } = warmed();
    const calls = gl.compile.mock.calls.length;
    warmPrograms({ renderer: gl as never, camera: new PerspectiveCamera(), stage });
    expect(gl.compile.mock.calls.length).toBe(calls);
  });
});

describe("programsAtRest", () => {
  const spaceOf = ({ flying = false, inChat = false } = {}) => {
    const stage = new Scene();
    const { gl } = renderer(stage);
    return {
      gl,
      disposed: false,
      options: { inChat },
      rig: { flying },
      renderer: gl as never,
      camera: new PerspectiveCamera(),
      stage: { scene: stage },
    };
  };
  const task = () => new Promise((done) => setTimeout(done, 0));

  it("makes them in the task after a frame where nothing flies, never inside it: the home's dive waits for its loader", async () => {
    const space = spaceOf();
    programsAtRest(space);
    expect(space.gl.compile).not.toHaveBeenCalled();
    await task();
    expect(space.gl.compile).toHaveBeenCalled();
  });

  it("waits out a flight: the first still frame after it makes them, once", async () => {
    const space = spaceOf({ flying: true });
    programsAtRest(space);
    await task();
    expect(space.gl.compile).not.toHaveBeenCalled();
    space.rig.flying = false;
    programsAtRest(space);
    programsAtRest(space);
    await task();
    const calls = space.gl.compile.mock.calls.length;
    programsAtRest(space);
    await task();
    expect(space.gl.compile.mock.calls.length).toBe(calls);
  });

  it("makes none in the chat's small view, which shows one world and is made anew for the next", async () => {
    const space = spaceOf({ inChat: true });
    programsAtRest(space);
    await task();
    expect(space.gl.compile).not.toHaveBeenCalled();
  });

  it("makes none once the scene is gone", async () => {
    const space = spaceOf();
    programsAtRest(space);
    space.disposed = true;
    await task();
    expect(space.gl.compile).not.toHaveBeenCalled();
  });
});
