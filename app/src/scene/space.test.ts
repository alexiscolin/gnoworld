import { moodCells, MOTES, SHELLS, StarCells } from "@gnoworld/core";
import {
  AdditiveBlending,
  type BufferAttribute,
  Mesh,
  PerspectiveCamera,
  Points,
  Scene as Stage,
  WebGLRenderTarget,
  type EventDispatcher,
  type Material,
  type Object3D,
  type ShaderMaterial,
  type Texture,
  type WebGLRenderer,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { Disposer } from "./disposer.ts";
import { Space } from "./space.ts";

const HERE = { x: 0, y: 0, z: 0 };
const AWAY = { x: 100_000, y: 0, z: 0 };

// A renderer with no GPU: it says what was asked of it, in order.
function fakeRenderer() {
  const asked: unknown[] = [];
  const renderer = {
    setRenderTarget: vi.fn((target: WebGLRenderTarget | null) => {
      asked.push(target);
    }),
    render: vi.fn((stage: Stage) => {
      asked.push(stage);
    }),
  };
  return { asked, renderer, gl: renderer as unknown as WebGLRenderer };
}

const made = () => {
  const stage = new Stage();
  const owner = new Disposer();
  const space = new Space(stage, owner);
  const { renderer, gl, asked } = fakeRenderer();
  const camera = new PerspectiveCamera();
  space.march(gl, camera);
  const pass = renderer.render.mock.calls[0]?.[0];
  if (pass === undefined) throw new Error("no pass");
  return { stage, owner, space, pass, asked, gl, camera };
};
const materialOf = (object: Object3D) => (object as Object3D & { material: Material }).material as ShaderMaterial;
const fields = (stage: Stage) => stage.children.filter((child): child is Points => child instanceof Points);
const shown = (stage: Stage) => {
  const found = stage.children.find((child) => child instanceof Mesh);
  if (found === undefined) throw new Error("no sky");
  return materialOf(found);
};
const sky = (pass: Stage) => {
  const [found] = pass.children;
  if (found === undefined) throw new Error("no sky");
  return materialOf(found);
};
const uniform = (material: ShaderMaterial, name: string): unknown => material.uniforms[name]?.value;
const attribute = (field: Points, name: string) => field.geometry.getAttribute(name) as BufferAttribute;
const within = (value: number, top: number) => {
  expect(value).toBeGreaterThanOrEqual(0);
  expect(value).toBeLessThan(top);
};
interface Three {
  x: number;
  y: number;
  z: number;
}

describe("what it puts on the stage", () => {
  it("is one sky and a few fields, whatever the place: the count is the sky's, not the universe's", () => {
    const { stage, space } = made();
    const before = stage.children.length;
    space.follow({ x: 2 ** 40, y: -(2 ** 40), z: 9 }, 0);
    expect(stage.children).toHaveLength(before);
    expect(fields(stage).length).toBeGreaterThan(1);
    expect(fields(stage).length).toBeLessThan(6);
  });

  it("draws behind everything and writes no depth, so a body covers it at any distance", () => {
    const { stage } = made();
    for (const child of stage.children) {
      expect(child.renderOrder).toBeLessThan(0);
      expect(materialOf(child).depthWrite).toBe(false);
      expect(child.frustumCulled).toBe(false);
    }
  });

  it("adds light to the stage's black, and never paints over it", () => {
    const { stage } = made();
    for (const child of stage.children) expect(materialOf(child).blending).toBe(AdditiveBlending);
  });

  it("goes through the one image grade, every material shown", () => {
    const { stage } = made();
    for (const child of stage.children) {
      const material = materialOf(child);
      expect(material.toneMapped).toBe(true);
      expect(material.fragmentShader).toContain("#include <tonemapping_fragment>");
      expect(material.fragmentShader).toContain("#include <colorspace_fragment>");
    }
  });

  it("dithers the sky: a gradient near black would band in eight bits", () => {
    const { stage } = made();
    expect(shown(stage).dithering).toBe(true);
    expect(shown(stage).fragmentShader).toContain("#include <dithering_fragment>");
  });

  it("marches the sky apart, outside the grade, and shows that picture through it", () => {
    const { stage, pass } = made();
    expect(sky(pass).toneMapped).toBe(false);
    expect(sky(pass).fragmentShader).not.toContain("tonemapping_fragment");
    expect(uniform(shown(stage), "uSky") as Texture).toBeDefined();
  });

  it("shapes its points round, never a square", () => {
    const { stage } = made();
    for (const field of fields(stage)) expect(materialOf(field).fragmentShader).toContain("gl_PointCoord");
  });
});

describe("following the eye", () => {
  it("hands the GPU only what remains of a far coordinate", () => {
    const { stage, pass, space } = made();
    const far = 2 ** 40 + 0.5;
    space.follow({ x: far, y: -far, z: far }, 0);
    for (const field of fields(stage)) {
      const material = materialOf(field);
      const eye = uniform(material, "uEye") as Three;
      const side = uniform(material, "uSide") as number;
      for (const axis of [eye.x, eye.y, eye.z]) within(axis, side);
    }
    const mood = uniform(sky(pass), "uMoodAt") as Three;
    for (const axis of [mood.x, mood.y, mood.z]) within(axis, 1);
    for (const shell of uniform(sky(pass), "uCloudAt") as Three[])
      for (const axis of [shell.x, shell.y, shell.z]) within(axis, 1);
  });

  it("keeps a thousandth of a step at that far coordinate", () => {
    const { stage, space } = made();
    const [field] = fields(stage);
    if (field === undefined) throw new Error("no field");
    const eye = uniform(materialOf(field), "uEye") as Three;
    const cell = uniform(materialOf(field), "uCell") as number;
    const far = 2 ** 40;
    space.follow({ x: far, y: 0, z: 0 }, 0);
    const before = eye.x;
    space.follow({ x: far + 0.001, y: 0, z: 0 }, 0);
    expect((eye.x - before) * cell).toBeCloseTo(0.001, 4);
  });

  it("writes its buffers once for a cell: a frame inside it uploads nothing", () => {
    const { stage, pass, space } = made();
    space.follow(HERE, 0);
    const points = fields(stage).map((field) => attribute(field, "position").version);
    const mood = (uniform(sky(pass), "uMood") as { version: number }).version;
    space.follow({ x: 0.001, y: 0, z: 0 }, 0);
    expect(fields(stage).map((field) => attribute(field, "position").version)).toEqual(points);
    expect((uniform(sky(pass), "uMood") as { version: number }).version).toBe(mood);
  });

  it("writes them again when the eye crosses into another cell, colours with positions", () => {
    const { stage, pass, space } = made();
    space.follow(HERE, 0);
    const before = fields(stage).map((field) => attribute(field, "position").version);
    const tints = fields(stage).map((field) => attribute(field, "tint").version);
    const mood = (uniform(sky(pass), "uMood") as { version: number }).version;
    space.follow(AWAY, 0);
    fields(stage).forEach((field, at) => {
      expect(attribute(field, "position").version).toBeGreaterThan(before[at] ?? Infinity);
      expect(attribute(field, "tint").version).toBeGreaterThan(tints[at] ?? Infinity);
    });
    expect((uniform(sky(pass), "uMood") as { version: number }).version).toBeGreaterThan(mood);
  });

  it("draws what core says a cell holds, shell by shell: each field its own sky", () => {
    const { stage, space } = made();
    space.follow(AWAY, 0);
    const shells = [...SHELLS, MOTES];
    expect(fields(stage)).toHaveLength(shells.length);
    fields(stage).forEach((field, at) => {
      const shell = shells[at];
      if (shell === undefined) throw new Error("no shell");
      const stars = new StarCells(shell);
      stars.follow(AWAY);
      expect(field.geometry.getAttribute("position").array).toEqual(stars.positions);
      expect(field.geometry.getAttribute("tint").array).toEqual(stars.tints);
    });
    expect(fields(stage)[0]?.geometry.getAttribute("tint").array).not.toEqual(
      fields(stage)[1]?.geometry.getAttribute("tint").array,
    );
  });

  it("marches the mood core gives this place", () => {
    const { pass, space } = made();
    space.follow(AWAY, 0);
    const mood = moodCells();
    mood.follow(AWAY);
    expect((uniform(sky(pass), "uMood") as { image: { data: Uint8Array } }).image.data).toEqual(mood.data);
  });

  it("carries the motes on a slow wind, and leaves the stars where they are", () => {
    const { stage, space } = made();
    space.follow(HERE, 0);
    const eyes = () => fields(stage).map((field) => ({ ...(uniform(materialOf(field), "uEye") as Three) }));
    const before = eyes();
    space.follow(HERE, 60);
    const after = eyes();
    expect(after.slice(0, SHELLS.length)).toEqual(before.slice(0, SHELLS.length));
    expect(after.at(-1)).not.toEqual(before.at(-1));
  });

  it("keeps the motes' wind in its torus after days", () => {
    const { stage, space } = made();
    space.follow(HERE, 1e7);
    const motes = fields(stage).at(-1);
    if (motes === undefined) throw new Error("no motes");
    const eye = uniform(materialOf(motes), "uEye") as Three;
    for (const axis of [eye.x, eye.y, eye.z]) within(axis, MOTES.side);
  });
});

describe("the sky's pass", () => {
  it("draws into its own picture, then gives the screen back", () => {
    const { asked, pass } = made();
    expect(asked[0]).toBeInstanceOf(WebGLRenderTarget);
    expect(asked[1]).toBe(pass);
    expect(asked[2]).toBeNull();
  });

  it("is half the buffer's size a side: a soft sky costs a quarter of its pixels", () => {
    const { asked, space } = made();
    space.resize(1280, 800, 1.25);
    const target = asked[0] as WebGLRenderTarget;
    expect([target.width, target.height]).toEqual([800, 500]);
  });

  it("takes a size of at least a pixel", () => {
    const { asked, space } = made();
    space.resize(1, 1, 0.8);
    const target = asked[0] as WebGLRenderTarget;
    expect([target.width, target.height]).toEqual([1, 1]);
  });

  it("sizes the stars by the buffer's pixels", () => {
    const { stage, space } = made();
    space.resize(1280, 800, 1.25);
    for (const field of fields(stage)) expect(uniform(materialOf(field), "uRatio") as number).toBe(1.25);
  });
});

describe("a Low device", () => {
  it("marches fewer shells of the sky, on the same program", () => {
    const { pass, space } = made();
    const high = uniform(sky(pass), "uShells") as number;
    const shader = sky(pass).fragmentShader;
    space.detail("low");
    expect(uniform(sky(pass), "uShells") as number).toBeLessThan(high);
    expect(uniform(sky(pass), "uShells") as number).toBeGreaterThan(0);
    expect(sky(pass).fragmentShader).toBe(shader);
    space.detail("high");
    expect(uniform(sky(pass), "uShells") as number).toBe(high);
  });
});

describe("leaving", () => {
  it("frees every geometry, material, texture and target it made, and takes itself off the stage", () => {
    const { stage, owner, pass, asked } = made();
    const freed = vi.fn();
    const objects = [...stage.children, ...pass.children];
    const seen = new Set<EventDispatcher<{ dispose: object }>>();
    for (const object of objects) {
      seen.add((object as Points).geometry);
      seen.add(materialOf(object));
      for (const { value } of Object.values(materialOf(object).uniforms))
        if (
          (value as { isTexture?: boolean } | null)?.isTexture === true &&
          value !== (asked[0] as WebGLRenderTarget).texture
        )
          seen.add(value as Texture);
    }
    seen.add(asked[0] as WebGLRenderTarget);
    for (const resource of seen) resource.addEventListener("dispose", freed);
    owner.dispose();
    expect(freed).toHaveBeenCalledTimes(seen.size);
    expect(stage.children).toHaveLength(0);
  });
});
