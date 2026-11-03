// @vitest-environment jsdom
import { Group, SphereGeometry, Vector3, Vector4 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EARTH, GROUND_TO_MAP } from "./earth/look.ts";
import { MAP_WIDTH, PER_FRAME, portraitsOf, SUN, type PortraitDevice } from "./portraits.ts";

// The rail's planets (7i): each world drawn alone by the planets' own code, the Earth from its own maps, lit from the side as the frames'
// are, in a corner of the scene's canvas at the start of a frame the scene lends, before it draws its own over it; read back as a picture
// the page can show, the renderer given back as it was found, and every map, planet and sphere let go.
const made = vi.hoisted(() => ({
  maps: [] as { name: string; width: number | undefined; kind: string }[],
  freed: [] as string[],
  failing: new Set<string>(),
  planets: [] as {
    id: string;
    group: unknown;
    setSun: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    surface: { uniforms: Record<string, { value: unknown }> };
    setLimb: ReturnType<typeof vi.fn>;
  }[],
  earth: [] as { look: unknown; set: { map: (name: string) => unknown; clouds: unknown; night?: unknown } }[],
  create: vi.fn<(world: { id: string }) => unknown>(),
}));

vi.mock("./planet/maps.ts", async (actual) => ({
  ...(await actual<typeof import("./planet/maps.ts")>()),
  loadMap: vi.fn((url: string, { width, kind }: { width?: number; kind: string }) => {
    const name = /textures\/([\w-]+)\.webp$/.exec(url)?.[1] ?? "";
    made.maps.push({ name, width, kind });
    return made.failing.has(name)
      ? Promise.reject(new Error("no map"))
      : Promise.resolve({ name, image: { width: width ?? 0, height: (width ?? 0) / 2 }, dispose: vi.fn() });
  }),
  freeMap: vi.fn((texture: { name: string }) => made.freed.push(texture.name)),
}));

const planetOf = (id: string) => {
  const planet = {
    id,
    group: new Group(),
    setSun: vi.fn(),
    setLimb: vi.fn(),
    dispose: vi.fn(),
    surface: { uniforms: { spin: { value: undefined as unknown } } },
  };
  made.planets.push(planet);
  return planet;
};

vi.mock("./planet/generated.ts", () => ({
  worldOf: (id: string) => ({ id, look: { map: id === "gov/dao" ? "mars" : "venus" }, recipe: { minorMap: "moon" } }),
  createWorld: (world: { id: string }) => made.create(world),
}));

vi.mock("./planet/planet.ts", async (actual) => ({
  ...(await actual<typeof import("./planet/planet.ts")>()),
  createPlanet: (look: unknown, set: (typeof made.earth)[number]["set"]) => {
    made.earth.push({ look, set });
    return planetOf("earth");
  },
}));

function deviceOf(ratio = 2, { scissorTest = false } = {}) {
  const lent: (() => void)[] = [];
  const stood: number[] = [];
  const viewport = new Vector4(0, 0, 1728, 1080);
  const scissor = new Vector4(0, 0, 1728, 1080);
  const gl = {
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
    // The GPU reads rows from the bottom: the bottom row red, every other blue. Its arguments: x, y, width, height, format, type, out.
    readPixels: vi.fn((...read: [number, number, number, number, number, number, Uint8Array]) => {
      const [, , width, height, , , out] = read;
      for (let row = 0; row < height; row += 1)
        for (let column = 0; column < width; column += 1)
          out.set(row === 0 ? [255, 0, 0, 255] : [0, 0, 255, 255], 4 * (row * width + column));
    }),
    isContextLost: () => false,
  };
  const renderer = {
    getPixelRatio: () => ratio,
    getViewport: (into: Vector4) => into.copy(viewport),
    setViewport: vi.fn((...box: [number, number, number, number]) => viewport.set(...box)),
    getScissor: (into: Vector4) => into.copy(scissor),
    setScissor: vi.fn((...box: [number, number, number, number]) => scissor.set(...box)),
    getScissorTest: () => scissorTest,
    setScissorTest: vi.fn(),
    // What stands on the stage as each is drawn: the stage itself changes after.
    render: vi.fn((stage: Group) => {
      stood.push(stage.children.length);
    }),
    getContext: () => gl,
    capabilities: { getMaxAnisotropy: () => 8 },
    initTexture: vi.fn(),
  };
  const gone = new AbortController();
  const device = {
    renderer,
    base: "/",
    halved: () => false,
    lend: (draw: () => void) => {
      lent.push(draw);
    },
    signal: gone.signal,
  } as unknown as PortraitDevice;
  // The scene's next frame: what was lent runs first.
  const frame = () => {
    for (const draw of lent.splice(0)) draw();
  };
  return { device, renderer, gl, lent, frame, viewport, scissor, stood, gone };
}

const pictures = vi.hoisted(() => ({ put: [] as { data: Uint8ClampedArray }[], encoded: [] as string[] }));
beforeEach(() => {
  made.create.mockImplementation((world) => planetOf(world.id));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
      ({
        createImageData: (width: number, height: number) => ({
          data: new Uint8ClampedArray(4 * width * height),
          width,
          height,
        }),
        putImageData: (image: { data: Uint8ClampedArray }) => pictures.put.push(image),
      }) as unknown as RenderingContext,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation((type?: string) => {
    pictures.encoded.push(type ?? "");
    return "data:image/jpeg;base64,PORTRAIT";
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  made.maps.length = 0;
  made.freed.length = 0;
  made.failing.clear();
  made.planets.length = 0;
  made.earth.length = 0;
  pictures.put.length = 0;
  pictures.encoded.length = 0;
});

// The maps load in turns of the microtask queue.
const settle = async () => {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
};

describe("the rail's portraits", () => {
  it("draws each world alone in a frame the scene lends, once its maps have come, and hands back a picture of each", async () => {
    const { device, renderer, lent, frame } = deviceOf();
    const asked = portraitsOf(device, ["gov/dao", "games/go"], 100);
    expect(lent).toHaveLength(0);
    await settle();
    expect(lent).toHaveLength(1);
    expect(renderer.render).not.toHaveBeenCalled();
    frame();
    await settle();
    const drawn = await asked;
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect([...drawn.keys()]).toEqual(["gov/dao", "games/go"]);
    expect([...drawn.values()].every((src) => src.startsWith("data:image/jpeg"))).toBe(true);
    expect(pictures.encoded.every((type) => type === "image/jpeg")).toBe(true);
  });

  it("stands each world alone on the stage it draws", async () => {
    const { device, frame, stood } = deviceOf();
    const asked = portraitsOf(device, ["gov/dao", "games/go"], 100);
    await settle();
    frame();
    await asked;
    expect(stood).toEqual([1, 1]);
  });

  it("lights each world from the side, as the frames' planets are", async () => {
    const { device, frame } = deviceOf();
    const asked = portraitsOf(device, ["gov/dao"], 100);
    await settle();
    frame();
    await asked;
    const sun = made.planets[0]?.setSun.mock.calls[0]?.[0] as Vector3;
    expect(sun.toArray()).toEqual(SUN.toArray());
    expect(Math.abs(SUN.x)).toBeGreaterThan(0.3);
    expect(SUN.length()).toBeCloseTo(1, 6);
  });

  it("draws the Earth from its day, night and clouds, turned as its globe is, with its bright rim", async () => {
    const { device, frame } = deviceOf();
    const asked = portraitsOf(device, ["earth"], 100);
    await settle();
    frame();
    const drawn = await asked;
    const [earth] = made.earth;
    expect(earth?.look).toBe(EARTH);
    expect((earth?.set.map("moon") as { name: string }).name).toBe("earth-day");
    expect((earth?.set.night as { name: string }).name).toBe("earth-night");
    expect((earth?.set.clouds as { name: string }).name).toBe("clouds");
    expect(made.planets[0]?.surface.uniforms["spin"]?.value).toBe(GROUND_TO_MAP);
    expect(made.planets[0]?.setLimb).toHaveBeenCalled();
    expect([...drawn.keys()]).toEqual(["earth"]);
  });

  it("asks each map once, at the portraits' width, halved where the scene is", async () => {
    const { device, frame } = deviceOf();
    const asked = portraitsOf(device, ["gov/dao", "games/go", "earth"], 100);
    await settle();
    frame();
    await asked;
    const names = made.maps.map(({ name }) => name);
    expect(new Set(names).size).toBe(names.length);
    expect(made.maps.find(({ name }) => name === "mars")?.width).toBe(MAP_WIDTH);
    expect(MAP_WIDTH).toBeLessThanOrEqual(1024);
    const halved = deviceOf();
    const low = portraitsOf({ ...halved.device, halved: () => true }, ["gov/dao"], 100);
    await settle();
    halved.frame();
    await low;
    expect(made.maps.filter(({ name }) => name === "mars").at(-1)?.width).toBe(MAP_WIDTH / 2);
  });

  it("reads each picture from the corner it drew in, at the size asked times the pixel ratio", async () => {
    const { device, renderer, gl, frame } = deviceOf(2);
    const asked = portraitsOf(device, ["gov/dao"], 100);
    await settle();
    frame();
    await asked;
    expect(renderer.setViewport).toHaveBeenCalledWith(0, 0, 100, 100);
    expect(renderer.setScissor).toHaveBeenCalledWith(0, 0, 100, 100);
    expect(renderer.setScissorTest).toHaveBeenCalledWith(true);
    expect(gl.readPixels.mock.calls[0]?.slice(0, 4)).toEqual([0, 0, 200, 200]);
  });

  it("turns the rows the GPU reads from the bottom the right way up", async () => {
    const { device, frame } = deviceOf(1);
    const asked = portraitsOf(device, ["gov/dao"], 4);
    await settle();
    frame();
    await asked;
    const image = pictures.put[0];
    const pixel = (x: number, y: number) => [...(image?.data.slice(4 * (y * 4 + x), 4 * (y * 4 + x) + 4) ?? [])];
    expect(pixel(0, 3)).toEqual([255, 0, 0, 255]);
    expect(pixel(0, 0)).toEqual([0, 0, 255, 255]);
  });

  it("gives the renderer back as it found it: its viewport, its scissor and its test", async () => {
    const { device, renderer, frame, viewport, scissor } = deviceOf();
    const asked = portraitsOf(device, ["gov/dao", "games/go"], 100);
    await settle();
    frame();
    await asked;
    expect(viewport.toArray()).toEqual([0, 0, 1728, 1080]);
    expect(scissor.toArray()).toEqual([0, 0, 1728, 1080]);
    expect(renderer.setScissorTest).toHaveBeenLastCalledWith(false);
  });

  it("lets go every planet and map it made", async () => {
    const { device, frame } = deviceOf();
    const asked = portraitsOf(device, ["gov/dao", "earth"], 100);
    await settle();
    frame();
    await asked;
    expect(made.planets.every((planet) => planet.dispose.mock.calls.length === 1)).toBe(true);
    expect([...made.freed].sort()).toEqual([...new Set(made.maps.map(({ name }) => name))].sort());
  });

  it("gives no portrait to a world whose map did not come, and draws the others", async () => {
    made.failing.add("mars");
    const { device, frame } = deviceOf();
    const asked = portraitsOf(device, ["gov/dao", "games/go"], 100);
    await settle();
    frame();
    const drawn = await asked;
    expect([...drawn.keys()]).toEqual(["games/go"]);
    expect(made.freed).not.toContain("mars");
  });

  it("asks no frame when nothing can be drawn", async () => {
    made.failing.add("venus");
    const { device, lent } = deviceOf();
    const drawn = await portraitsOf(device, ["games/go"], 100);
    expect(drawn.size).toBe(0);
    expect(lent).toHaveLength(0);
  });

  it("hands back nothing from a lost context, and lets go what it made", async () => {
    const { device, gl, frame } = deviceOf();
    gl.isContextLost = () => true;
    const asked = portraitsOf(device, ["gov/dao"], 100);
    await settle();
    frame();
    const drawn = await asked;
    expect(drawn.size).toBe(0);
    expect(made.planets.every((planet) => planet.dispose.mock.calls.length === 1)).toBe(true);
  });

  it("draws a few portraits a frame, so no frame of the scene's waits on all of them", async () => {
    const { device, renderer, lent, frame } = deviceOf();
    const ids = ["a/a", "b/b", "c/c", "d/d", "e/e", "f/f"];
    const asked = portraitsOf(device, ids, 100);
    await settle();
    frame();
    expect(renderer.render).toHaveBeenCalledTimes(PER_FRAME);
    await settle();
    expect(lent).toHaveLength(1);
    frame();
    const drawn = await asked;
    expect([...drawn.keys()]).toEqual(ids);
    expect(PER_FRAME).toBeLessThan(ids.length);
  });

  it("gives back a scissor test that was on as it found it", async () => {
    const { device, renderer, frame } = deviceOf(2, { scissorTest: true });
    const asked = portraitsOf(device, ["gov/dao"], 100);
    await settle();
    frame();
    await asked;
    expect(renderer.setScissorTest).toHaveBeenLastCalledWith(true);
  });

  it("gives the renderer back and lets go what it made when a draw throws", async () => {
    const { device, renderer, frame, viewport, scissor } = deviceOf();
    renderer.render.mockImplementation(() => {
      throw new Error("refused");
    });
    const asked = portraitsOf(device, ["gov/dao"], 100);
    await settle();
    frame();
    await expect(asked).resolves.toEqual(new Map());
    expect(viewport.toArray()).toEqual([0, 0, 1728, 1080]);
    expect(scissor.toArray()).toEqual([0, 0, 1728, 1080]);
    expect(renderer.setScissorTest).toHaveBeenLastCalledWith(false);
    expect(made.planets.every((planet) => planet.dispose.mock.calls.length === 1)).toBe(true);
    expect(made.freed.length).toBeGreaterThan(0);
  });

  it("gives the Earth none when its clouds do not come, and lets its day and night go", async () => {
    made.failing.add("clouds");
    const { device, lent } = deviceOf();
    const drawn = await portraitsOf(device, ["earth"], 100);
    expect(drawn.size).toBe(0);
    expect(lent).toHaveLength(0);
    expect([...made.freed].sort()).toEqual(["earth-day", "earth-night"]);
  });

  it("lets go the maps it loaded when a planet cannot be made", async () => {
    made.create.mockImplementation(() => {
      throw new Error("no program");
    });
    const { device } = deviceOf();
    await expect(portraitsOf(device, ["gov/dao"], 100)).resolves.toEqual(new Map());
    expect(made.freed.length).toBe(new Set(made.maps.map(({ name }) => name)).size);
  });

  it("lets its sphere go", async () => {
    const freed = vi.spyOn(SphereGeometry.prototype, "dispose");
    const { device, frame } = deviceOf();
    const asked = portraitsOf(device, ["gov/dao"], 100);
    await settle();
    frame();
    await asked;
    expect(freed).toHaveBeenCalledTimes(1);
  });

  it("hands back nothing and lets everything go when the scene goes before its frame", async () => {
    const { device, gone, renderer } = deviceOf();
    const asked = portraitsOf(device, ["gov/dao", "earth"], 100);
    await settle();
    gone.abort();
    await expect(asked).resolves.toEqual(new Map());
    expect(renderer.render).not.toHaveBeenCalled();
    expect(made.planets.every((planet) => planet.dispose.mock.calls.length === 1)).toBe(true);
    expect([...made.freed].sort()).toEqual([...new Set(made.maps.map(({ name }) => name))].sort());
  });

  it("keeps the portraits drawn before the scene went", async () => {
    const { device, gone, frame } = deviceOf();
    const asked = portraitsOf(device, ["a/a", "b/b", "c/c", "d/d", "e/e", "f/f"], 100);
    await settle();
    frame();
    await settle();
    gone.abort();
    const drawn = await asked;
    expect([...drawn.keys()]).toEqual(["a/a", "b/b", "c/c", "d/d"]);
  });

  it("hands back no picture where the page cannot draw one", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const { device, frame } = deviceOf();
    const asked = portraitsOf(device, ["gov/dao"], 100);
    await settle();
    frame();
    expect((await asked).size).toBe(0);
  });
});
