import { BufferAttribute, BufferGeometry, Mesh, Scene, ShaderMaterial, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { shownOf } from "./shown.ts";

function stage() {
  const uniforms = {
    uGain: { value: 1 },
    uEye: { value: new Vector3(0.1, 0.2, 0.3) },
    uTime: { value: 5 },
    time: { value: 5 },
    ringTime: { value: 5 },
    sun: { value: new Vector3(1, 0, 0) },
    cloudTime: { value: 5 },
    uAt: { value: new Vector3(1, 2, 3) },
  };
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(9), 3));
  const mesh = new Mesh(geometry, new ShaderMaterial({ uniforms }));
  const scene = new Scene();
  scene.add(mesh);
  const read = () => shownOf(scene, []);
  return { uniforms, mesh, geometry, read };
}

type Stage = ReturnType<typeof stage>;

describe("shownOf", () => {
  it("reads the same twice when nothing changed", () => {
    const { read } = stage();
    expect(read()).toEqual(read());
  });

  it.each([
    ["a uniform eases", (s: Stage) => (s.uniforms.uGain.value = 0.5)],
    ["a vector uniform moves", (s: Stage) => s.uniforms.uAt.value.setX(9)],
    ["a part goes out of sight", (s: Stage) => (s.mesh.visible = false)],
  ])("reads differently once %s", (_, change) => {
    const s = stage();
    const before = s.read();
    change(s);
    expect(s.read()).not.toEqual(before);
  });

  it("reads differently once a buffer is rewritten", () => {
    const s = stage();
    const before = s.read();
    const position = s.geometry.getAttribute("position");
    position.needsUpdate = true;
    expect(s.read()).not.toEqual(before);
  });

  it("leaves the clocks out: the slow motions are judged by their pixels", () => {
    const s = stage();
    const before = s.read();
    s.uniforms.uTime.value = 99;
    s.uniforms.time.value = 99;
    s.uniforms.cloudTime.value = 99;
    s.uniforms.ringTime.value = 99;
    s.uniforms.sun.value.set(0, 1, 0);
    expect(s.read()).toEqual(before);
  });

  it("leaves the dust's wrapped eye out: it follows the camera, which the frame already weighs", () => {
    const s = stage();
    const before = s.read();
    s.uniforms.uEye.value.setX(0.9);
    expect(s.read()).toEqual(before);
  });
});
