import { Mesh, PerspectiveCamera, Scene, ShaderMaterial, type Object3D } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GENERATED_FRAGMENT } from "../planet/generatedShader.ts";
import { SURFACE_FRAGMENT } from "../planet/surfaceShader.ts";

const rests = vi.hoisted(() => [] as (() => void)[]);
vi.mock("../../afterLoad.ts", () => ({
  afterLoad: (then: () => void) => {
    rests.push(then);
  },
}));
// The browser's own, which Node lacks.
vi.stubGlobal("reportError", vi.fn());
const { programsAtRest, warmPrograms } = await import("./programs.ts");

// A renderer that records what each compile is asked to make: every material of the tree, its shader and whether it is transparent,
// and whether the blur's kind of target was set (rig/blurred.ts).
function renderer() {
  const made = new Set<string>();
  let target: unknown = null;
  const name = (shader: string) =>
    shader === GENERATED_FRAGMENT
      ? "generated"
      : shader === SURFACE_FRAGMENT
        ? "hand-made"
        : `other ${String(shader.length)}`;
  const record = (root: Object3D) => {
    root.traverse((part) => {
      if (part instanceof Mesh && part.material instanceof ShaderMaterial)
        made.add(
          `${name(part.material.fragmentShader)} ${part.material.transparent ? "coming" : "opaque"} ${target === null ? "screen" : "blur"}`,
        );
    });
  };
  const gl = {
    extensions: { has: () => false },
    getContext: () => ({ getContextAttributes: () => ({ antialias: false }) }),
    getRenderTarget: () => target,
    setRenderTarget: (next: unknown) => {
      target = next;
    },
    compile: vi.fn(record),
    compileAsync: vi.fn((root: Object3D) => {
      record(root);
      return Promise.resolve(root);
    }),
  };
  return { gl, made };
}

const device = (gl: object) => ({ renderer: gl as never, camera: new PerspectiveCamera(), stage: new Scene() });

afterEach(() => {
  rests.length = 0;
});

describe("warmPrograms", () => {
  it("makes the programs every planet draws with: a world with air, glow and rings and the Earth, each surface opaque and coming in, on screen and in the blur", async () => {
    const { gl, made } = renderer();
    await warmPrograms(device(gl));
    for (const surface of ["generated", "hand-made"])
      for (const state of ["opaque", "coming"])
        for (const where of ["screen", "blur"])
          expect(made, `${surface} ${state} ${where}`).toContain(`${surface} ${state} ${where}`);
    const others = new Set([...made].filter((one) => one.startsWith("other")).map((one) => one.split(" ")[1]));
    expect(others.size, "air, glow and rings").toBeGreaterThanOrEqual(3);
  });

  it("keeps what it made: three drops a program its last material leaves", async () => {
    const dispose = vi.spyOn(ShaderMaterial.prototype, "dispose");
    await warmPrograms(device(renderer().gl));
    expect(dispose).not.toHaveBeenCalled();
    dispose.mockRestore();
  });

  it("makes them once a renderer", async () => {
    const { gl } = renderer();
    await Promise.all([warmPrograms(device(gl)), warmPrograms(device(gl))]);
    const calls = gl.compileAsync.mock.calls.length;
    await warmPrograms(device(gl));
    expect(gl.compileAsync.mock.calls.length).toBe(calls);
    expect(calls).toBe(2);
  });
});

describe("programsAtRest", () => {
  const spaceOf = (flying: boolean) => {
    const { gl } = renderer();
    return {
      gl,
      rig: { flying },
      renderer: gl as never,
      camera: new PerspectiveCamera(),
      stage: { scene: new Scene() },
    };
  };
  const task = () => new Promise((done) => setTimeout(done, 0));

  it("makes them in the task after the first frame where nothing flies: the home's dive waits for its loader, and its landing finds them", async () => {
    const space = spaceOf(false);
    programsAtRest(space, new AbortController().signal);
    expect(space.gl.compile, "never inside the frame").not.toHaveBeenCalled();
    await task();
    expect(space.gl.compile).toHaveBeenCalled();
  });

  it("waits out a flight, then makes them at the next moment of rest", async () => {
    const space = spaceOf(true);
    programsAtRest(space, new AbortController().signal);
    await task();
    rests.shift()?.();
    expect(space.gl.compile).not.toHaveBeenCalled();
    space.rig.flying = false;
    rests.shift()?.();
    expect(space.gl.compile).toHaveBeenCalled();
  });

  it("makes none once the scene is gone", async () => {
    const space = spaceOf(false);
    const gone = new AbortController();
    programsAtRest(space, gone.signal);
    gone.abort();
    await task();
    expect(space.gl.compile).not.toHaveBeenCalled();
  });
});
