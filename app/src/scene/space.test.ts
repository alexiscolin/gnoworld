import { moodCells, MOTES, SHELLS, StarCells } from "@gnoworld/core";
import {
  AdditiveBlending,
  type BufferAttribute,
  Mesh,
  PerspectiveCamera,
  Points,
  Scene as Stage,
  Texture,
  WebGLRenderTarget,
  type EventDispatcher,
  type Material,
  type Object3D,
  type ShaderMaterial,
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

describe("its veil", () => {
  it("lets the sky through whole until a page veils it, and takes the share it is given", () => {
    const { stage, space } = made();
    expect(uniform(shown(stage), "uVeil")).toBe(1);
    space.veil(0.4);
    expect(uniform(shown(stage), "uVeil")).toBe(0.4);
    space.veil(1);
    expect(uniform(shown(stage), "uVeil")).toBe(1);
  });

  it("marches nothing for it: the picture is the same, shown fainter", () => {
    const { space, gl, camera, asked } = made();
    const before = asked.length;
    space.veil(0.4);
    space.march(gl, camera);
    expect(asked).toHaveLength(before);
  });
});

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
    expect(uniform(shown(stage), "uSky")).toBeInstanceOf(Texture);
  });

  it("shapes its points round, never a square, and blends them", () => {
    const { stage } = made();
    for (const field of fields(stage)) {
      expect(materialOf(field).fragmentShader).toContain("gl_PointCoord");
      expect(materialOf(field).transparent).toBe(true);
      expect(attribute(field, "tint").normalized).toBe(true);
    }
  });

  it("fades its far points with its edges in order: reversed, a driver may draw anything", () => {
    const { stage } = made();
    for (const field of fields(stage)) expect(materialOf(field).vertexShader).not.toContain("smoothstep(uFar, ");
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

  it("gives the sky what remains of the eye, axis by axis, each shell at its own share of a step", () => {
    const { pass, space } = made();
    space.follow({ x: 1000, y: -500, z: 12345 }, 0);
    const mood = uniform(sky(pass), "uMoodAt") as Three;
    expect([mood.x, mood.y, mood.z]).toEqual([0.390625, 0.8046875, 0.822265625]);
    const shells = uniform(sky(pass), "uCloudAt") as Three[];
    const expected = [
      [0.14423076923076922, 0.9278846153846154, 0.780528846153846],
      [0.05952380952380952, 0.9702380952380952, 0.7348214285714286],
      [0.021428571428571425, 0.9892857142857143, 0.26453571428571426],
      [0.008333333333333333, 0.9958333333333333, 0.102875],
    ];
    shells.forEach((shell, at) => {
      [shell.x, shell.y, shell.z].forEach((value, axis) => {
        expect(value).toBeCloseTo(expected[at]?.[axis] ?? NaN, 10);
      });
    });
  });

  it("gives a field the eye in its own cells, wrapped to its torus, axis by axis", () => {
    const { stage, space } = made();
    space.follow({ x: 1000, y: -500, z: 12345 }, 0);
    const [far] = fields(stage);
    if (far === undefined) throw new Error("no field");
    const eye = uniform(materialOf(far), "uEye") as Three;
    expect(eye.x).toBe(0.625);
    expect(eye.y).toBe(5.6875);
    expect(eye.z).toBeCloseTo(1.715625, 10);
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

  it("draws what core says a cell holds, shell by shell: each field its own sky", { timeout: 60_000 }, () => {
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

  it("carries the motes on a slow wind, 0.72 of a cell a minute along x and z, and leaves the stars where they are", () => {
    const { stage, space } = made();
    space.follow(HERE, 0);
    const eyes = () => fields(stage).map((field) => ({ ...(uniform(materialOf(field), "uEye") as Three) }));
    const before = eyes();
    space.follow(HERE, 60);
    const after = eyes();
    expect(after.slice(0, SHELLS.length)).toEqual(before.slice(0, SHELLS.length));
    expect(after.at(-1)?.x).toBeCloseTo(0.72, 10);
    expect(after.at(-1)?.y).toBe(0);
    expect(after.at(-1)?.z).toBeCloseTo(0.72, 10);
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

  describe("marches only when the view has moved", () => {
    const passes = () => {
      const { asked, gl, camera, space, stage } = made();
      const count = () => asked.filter((step) => step instanceof Stage).length;
      return { count, gl, camera, space, stage };
    };

    it("marches once for a view that stays", () => {
      const { count, gl, camera, space } = passes();
      space.follow(HERE, 0);
      space.march(gl, camera);
      const after = count();
      space.follow(HERE, 0);
      space.march(gl, camera);
      expect(count()).toBe(after);
    });

    it("skips a step under what a pixel of it can tell", () => {
      const { count, gl, camera, space } = passes();
      space.follow(HERE, 0);
      space.march(gl, camera);
      const after = count();
      space.follow({ x: 0.04, y: 0, z: 0 }, 0);
      space.march(gl, camera);
      expect(count()).toBe(after);
    });

    it.each([
      ["x", { x: 0.06, y: 0, z: 0 }],
      ["y", { x: 0, y: 0.06, z: 0 }],
      ["z", { x: 0, y: 0, z: 0.06 }],
    ])("marches for a step along %s past that", (_, step) => {
      const { count, gl, camera, space } = passes();
      space.follow(HERE, 0);
      space.march(gl, camera);
      const after = count();
      space.follow(step, 0);
      space.march(gl, camera);
      expect(count()).toBe(after + 1);
    });

    it("adds small steps up: a slow drift still arrives", () => {
      const { count, gl, camera, space } = passes();
      space.follow(HERE, 0);
      space.march(gl, camera);
      const after = count();
      for (let step = 1; step <= 6; step += 1) {
        space.follow({ x: 0.02 * step, y: 0, z: 0 }, 0);
        space.march(gl, camera);
      }
      expect(count()).toBeGreaterThan(after);
    });

    it.each([
      ["sideways", "y" as const],
      ["up", "x" as const],
    ])("marches for a turn %s, the view being what it draws", (_, axis) => {
      const { count, gl, camera, space } = passes();
      space.follow(HERE, 0);
      space.march(gl, camera);
      const after = count();
      camera.rotation[axis] = 0.002;
      space.march(gl, camera);
      expect(count()).toBe(after + 1);
    });

    it.each([
      [
        "a new size, which empties the picture",
        (space: Space) => {
          space.resize(800, 600, 1);
        },
      ],
      [
        "a context come back with nothing in it",
        (space: Space) => {
          space.redraw();
        },
      ],
    ])("marches after %s", (_, change) => {
      const { count, gl, camera, space } = passes();
      space.follow(HERE, 0);
      space.march(gl, camera);
      const after = count();
      change(space);
      space.march(gl, camera);
      expect(count()).toBe(after + 1);
    });

    it("marches when the mood's volume moved, a cell further on", () => {
      const { count, gl, camera, space } = passes();
      space.follow(HERE, 0);
      space.march(gl, camera);
      const after = count();
      space.follow({ x: 100_000, y: 0, z: 0 }, 0);
      space.march(gl, camera);
      expect(count()).toBe(after + 1);
    });
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
  const read = (pass: Stage) => ({
    shells: uniform(sky(pass), "uShells") as number,
    far: uniform(sky(pass), "uFar") as number,
    gain: uniform(sky(pass), "uGain") as number,
  });

  it("starts thin when it is known slow, on the same program", () => {
    const { pass, space } = made();
    const high = read(pass);
    const shader = sky(pass).fragmentShader;
    space.detail("low");
    expect(read(pass).shells).toBeLessThan(high.shells);
    expect(read(pass).shells).toBeGreaterThan(0);
    expect(read(pass).far).toBe(0);
    expect(read(pass).gain).toBeGreaterThan(high.gain);
    expect(sky(pass).fragmentShader).toBe(shader);
  });

  it("fades its far shells out over a second when the probe says Low, and lifts what stays: a drop would show", () => {
    const { pass, space } = made();
    const high = read(pass);
    space.follow(HERE, 10);
    space.detail("low");
    expect(read(pass).far).toBe(1);
    space.follow(HERE, 10.5);
    expect(read(pass).far).toBeCloseTo(0.5, 6);
    expect(read(pass).shells).toBe(high.shells);
    expect(read(pass).gain).toBeGreaterThan(high.gain);
    space.follow(HERE, 11.1);
    expect(read(pass).far).toBe(0);
    expect(read(pass).shells).toBeLessThan(high.shells);
  });

  it("marches through the fade, each step of it a new picture", () => {
    const { pass, space, gl, camera, asked } = made();
    space.follow(HERE, 10);
    space.march(gl, camera);
    space.detail("low");
    const before = asked.filter((step) => step === pass).length;
    space.follow(HERE, 10.5);
    space.march(gl, camera);
    expect(asked.filter((step) => step === pass).length).toBe(before + 1);
  });

  it("comes back whole on High", () => {
    const { pass, space } = made();
    const high = read(pass);
    space.detail("low");
    space.detail("high");
    expect(read(pass)).toEqual(high);
  });

  it("goes at once where time stands still: under reduced motion nothing fades", () => {
    const { pass, space } = made();
    space.follow(HERE, 5);
    space.detail("low");
    space.follow(HERE, 5);
    expect(read(pass).far).toBe(0);
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
