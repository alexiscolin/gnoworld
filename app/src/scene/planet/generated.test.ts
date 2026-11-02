import {
  ANCHORS,
  asciiBytes,
  planetLook,
  planetRecipe,
  planetSeed,
  SURFACE,
  worldLook,
  worldRecipe,
  worldSigns,
  type Anchor,
  type Surface,
} from "@gnoworld/core";
import { Color, Mesh, RingGeometry, ShaderMaterial, SphereGeometry, Texture, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorld, worldOf, worldUniforms, type World } from "./generated.ts";
import { GENERATED_FRAGMENT } from "./generatedShader.ts";
import type { MapSet, Planet } from "./planet.ts";
import { SHADE } from "./surfaceParts.ts";
import { SURFACE_FRAGMENT } from "./surfaceShader.ts";
import { working } from "./uniforms.ts";

// Every world but the Earth, drawn from its recipe (slice 7, 7b5; ADR-0002 §3, "a class is data"): one program for all of them, each
// value of 7b4's surface a uniform of its own name, the palettes as the recipe gives them, real maps as detail only, and the Earth's light.
const PATH = asciiBytes("gno.land/r/gov/dao");
const NAMES = [...Object.keys(SURFACE), "octaves"] as (keyof Surface)[];
const sphere = new SphereGeometry(1, 8, 6);

const worldAt = (anchor: Anchor, path = PATH): World => ({
  look: planetLook(path, anchor),
  recipe: planetRecipe(path, anchor),
});
// A world of `anchor` with rings or none, from the first of 500 paths that has them.
const ringedAt = (anchor: Anchor, rings: boolean): World => {
  for (let at = 0; at < 500; at += 1) {
    const world = worldAt(anchor, asciiBytes(`gno.land/r/demo/ringed${String(at)}`));
    if ((world.look.rings !== null) === rings) return world;
  }
  throw new Error(`no ${anchor} with rings ${String(rings)}`);
};

// A set whose maps carry their names, so a swapped map shows.
const fixed = (extra: Partial<MapSet> = {}) => {
  const textures = new Map<string, Texture>();
  const set: MapSet = {
    map: (name) => {
      const texture = textures.get(name) ?? Object.assign(new Texture(), { name });
      textures.set(name, texture);
      return texture;
    },
    clouds: Object.assign(new Texture(), { name: "clouds" }),
    ring: Object.assign(new Texture(), { name: "ring" }),
    ...extra,
  };
  return { set, textures };
};

const drawn = (world: World, set = fixed().set) => createWorld(world, set, sphere);
const read = (material: ShaderMaterial, name: string): unknown => material.uniforms[name]?.value;
const shapeOf = (material: ShaderMaterial) => read(material, "shape") as Record<string, number>;
const linear = ([red, green, blue]: readonly [number, number, number]) => new Color().setRGB(red, green, blue);
const meshes = (planet: Planet) => planet.group.children.filter((child): child is Mesh => child instanceof Mesh);
const materialOf = (mesh: Mesh): ShaderMaterial => {
  if (mesh.material instanceof ShaderMaterial) return mesh.material;
  throw new Error("not a shader material");
};

// What a world hands its program, as plain values, each map by its name, so two builds compare and a swapped map shows.
const plain = (uniforms: Record<string, { value: unknown }>): unknown =>
  Object.fromEntries(
    Object.entries(uniforms).map(([name, { value }]) => {
      if (value instanceof Texture) return [name, `map ${value.name}`];
      if (value instanceof Vector3 || value instanceof Color) return [name, value.toArray()];
      if (value !== null && typeof value === "object" && "elements" in value) return [name, value.elements];
      return [name, value];
    }),
  );

describe("a generated world, drawn from its recipe", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([...ANCHORS])("hands %s's every surface value to its program, under the value's own name", (anchor) => {
    const world = worldAt(anchor);
    const shape = shapeOf(drawn(world).surface);
    for (const name of NAMES) expect(shape[name], name).toBe(world.recipe.surface[name]);
    expect(Object.keys(shape).sort()).toEqual([...NAMES].sort());
  });

  it("hands the palette and the minor's palette as the recipe gives them, in the working space", () => {
    const world = worldAt("desert");
    const { surface } = drawn(world);
    const [low, mid, high] = world.recipe.palette.linear;
    const [minorLow, minorMid, minorHigh] = world.recipe.minorPalette.linear;
    expect(read(surface, "low")).toEqual(linear(low));
    expect(read(surface, "mid")).toEqual(linear(mid));
    expect(read(surface, "high")).toEqual(linear(high));
    expect(read(surface, "minorLow")).toEqual(linear(minorLow));
    expect(read(surface, "minorMid")).toEqual(linear(minorMid));
    expect(read(surface, "minorHigh")).toEqual(linear(minorHigh));
  });

  it("hands the minor class its share and its own real map, the dominant its own, and asks for no other map", () => {
    const world = worldAt("rocky");
    const { set, textures } = fixed();
    const { surface } = drawn(world, set);
    expect(read(surface, "minorShare")).toBe(world.recipe.minorShare);
    expect((read(surface, "surface") as Texture).name).toBe(world.look.map);
    expect((read(surface, "minorMap") as Texture).name).toBe(world.recipe.minorMap);
    expect([...textures.keys()].sort()).toEqual([...new Set([world.look.map, world.recipe.minorMap])].sort());
  });

  it("places the structure and the minor's regions each by an offset of the look's own", () => {
    const world = worldAt("ice");
    const { surface } = drawn(world);
    expect(read(surface, "offset")).toEqual(new Vector3(...world.look.warp.offset));
    expect(read(surface, "minorOffset")).toEqual(new Vector3(...world.look.minorOffset));
  });

  it("hands the real map's warp, its share of recolour and the relief from the look", () => {
    const world = worldAt("rocky");
    const { surface } = drawn(world);
    expect(read(surface, "warpFrequency")).toBe(world.look.warp.frequency);
    expect(read(surface, "warpAmount")).toBeLessThanOrEqual(world.look.warp.amount);
    expect(read(surface, "recolour")).toBe(world.look.recolour);
    expect(read(surface, "relief")).toBe(world.look.relief);
  });

  it("never stretches a real map by more than a fifth, at any frequency, so nothing streaks", () => {
    for (const anchor of ANCHORS)
      for (let at = 0; at < 20; at += 1) {
        const world = worldAt(anchor, asciiBytes(`gno.land/r/demo/stretch${String(at)}`));
        const amount = read(drawn(world).surface, "warpAmount") as number;
        expect(amount * world.look.warp.frequency, anchor).toBeLessThanOrEqual(0.2 + 1e-9);
      }
  });

  it("shares one program among all 24 anchors: a class is data, and no anchor's name is in the shader", () => {
    const [first, ...others] = ANCHORS.map((anchor) => drawn(worldAt(anchor)).surface);
    if (first === undefined) throw new Error("no anchors");
    for (const other of others) {
      expect(other.fragmentShader).toBe(first.fragmentShader);
      expect(other.vertexShader).toBe(first.vertexShader);
      expect(other.defines).toEqual(first.defines);
    }
    for (const anchor of ANCHORS) expect(GENERATED_FRAGMENT, anchor).not.toMatch(new RegExp(`\\b${anchor}\\b`, "i"));
  });

  it("draws a gas world's bands and a ground's relief by value, from the recipe's band count", () => {
    for (const anchor of ANCHORS) {
      const world = worldAt(anchor);
      expect(read(drawn(world).surface, "banded"), anchor).toBe(world.recipe.surface.bands > 0 ? 1 : 0);
    }
    expect(read(drawn(worldAt("gas giant")).surface, "banded")).toBe(1);
    expect(read(drawn(worldAt("rocky")).surface, "banded")).toBe(0);
  });

  it("marks a glow, a lock and a sea by value, as the look gives them", () => {
    const volcanic = worldAt("volcanic");
    const lava = drawn(volcanic).surface;
    if (volcanic.look.glow === null) throw new Error("a volcanic world glows");
    expect(read(lava, "glowLevel")).toBe(volcanic.look.glow.level);
    expect(read(lava, "glowColour")).toEqual(working(volcanic.look.glow.colour));
    expect(read(drawn(worldAt("rocky")).surface, "glowLevel")).toBe(0);
    expect(read(drawn(worldAt("tidally locked")).surface, "locked")).toBe(1);
    expect(read(drawn(worldAt("rocky")).surface, "locked")).toBe(0);
    const ocean = worldAt("ocean");
    if (ocean.look.sea === null) throw new Error("an ocean world has a sea");
    expect(read(drawn(ocean).surface, "seaDeep")).toEqual(working(ocean.look.sea.deep));
  });

  it("gives the same path the same world, every time it is drawn (golden)", () => {
    for (const anchor of ANCHORS)
      expect(plain(drawn(worldAt(anchor)).surface.uniforms)).toEqual(plain(drawn(worldAt(anchor)).surface.uniforms));
    const id = "gnoswap/pool";
    expect(worldOf(id)).toEqual({ look: worldLook(id), recipe: worldRecipe(id) });
    expect(plain(drawn(worldOf(id)).surface.uniforms)).toEqual(plain(drawn(worldOf(id)).surface.uniforms));
  });

  it("tells two paths of one class apart", () => {
    const one = shapeOf(drawn(worldAt("desert")).surface);
    const other = shapeOf(drawn(worldAt("desert", asciiBytes("gno.land/r/gov/dao2"))).surface);
    expect(NAMES.filter((name) => one[name] !== other[name]).length).toBeGreaterThan(NAMES.length / 2);
  });

  // three's own constructors draw a uuid from Math.random: what a look decides is the uniforms' values, and those take no chance or clock.
  it("takes no clock and no chance: with both refused, a world's look, recipe and uniforms come as they did", () => {
    const { set } = fixed();
    const id = "gnoswap/pool";
    const before = plain(worldUniforms(worldOf(id), set));
    const refuse = () => {
      throw new Error("no chance and no clock in a look");
    };
    vi.spyOn(Math, "random").mockImplementation(refuse);
    vi.spyOn(Date, "now").mockImplementation(refuse);
    vi.spyOn(performance, "now").mockImplementation(refuse);
    expect(plain(worldUniforms(worldOf(id), set))).toEqual(before);
  });

  it("wears its air and its rings as the look gives them, the rings' mesh last", () => {
    const world = ringedAt("gas giant", true);
    const parts = meshes(drawn(world));
    if (world.look.rings === null || world.look.rim === null) throw new Error("a ringed giant with air");
    expect(parts).toHaveLength(3);
    const [, air, ring] = parts.map(materialOf);
    expect(read(air ?? new ShaderMaterial(), "rimThickness")).toBe(world.look.rim.thickness);
    expect(parts[2]?.geometry).toBeInstanceOf(RingGeometry);
    expect(read(ring ?? new ShaderMaterial(), "ringOuter")).toBe(world.look.rings.outer);
    expect(meshes(drawn(ringedAt("rocky", false)))).toHaveLength(1);
  });

  it("takes the sun, the time and the limb on every part, and a seed's halo, as a hand-made world does", () => {
    const world = ringedAt("gas giant", true);
    const planet = drawn(world);
    const sun = new Vector3(0, 1, 0);
    planet.setSun(sun);
    for (const part of meshes(planet)) expect((read(materialOf(part), "sun") as Vector3).equals(sun)).toBe(true);
    planet.setTime(120, 30);
    expect(read(planet.surface, "time")).toBe(120);
    expect(read(planet.surface, "cloudTime")).toBe(30);
    planet.setLimb(0.7);
    expect(read(materialOf(meshes(planet)[1] ?? new Mesh()), "limbLight")).toBe(0.7);
    planet.setSigns(worldSigns(planetSeed(PATH), "gas giant", { vitality: 0.1, present: 0.4, fresh: true }));
    expect(meshes(planet)).toHaveLength(4);
  });

  it("writes a stage's lights where it has their map, and leaves a world at rest as it was made", () => {
    const planet = drawn(worldAt("ice"), fixed({ lights: new Texture() }).set);
    const before = plain(planet.surface.uniforms);
    planet.setSigns(worldSigns(planetSeed(PATH), "ice", { vitality: 0.1, present: 0, fresh: false }));
    expect(plain(planet.surface.uniforms)).toEqual(before);
    const busy = worldSigns(planetSeed(PATH), "ice", { vitality: 0.8, present: 0.6, fresh: false });
    planet.setSigns(busy);
    expect(read(planet.surface, "settled")).toBe(busy.lights.extent);
    expect(read(planet.surface, "lightLevel")).toBe(busy.lights.level);
  });

  it("frees its own materials and leaves the shared maps", () => {
    const { set, textures } = fixed();
    const world = drawn(ringedAt("gas giant", true), set);
    const shared = [...textures.values(), set.clouds, set.ring].map((texture) => vi.spyOn(texture, "dispose"));
    const owned = meshes(world).map((mesh) => vi.spyOn(materialOf(mesh), "dispose"));
    expect(owned.length).toBeGreaterThan(2);
    world.dispose();
    for (const dispose of owned) expect(dispose).toHaveBeenCalledOnce();
    for (const dispose of shared) expect(dispose).not.toHaveBeenCalled();
  });
});

describe("the generated program", () => {
  it("lights every world with the Earth's own light: one chunk, in both programs", () => {
    expect(SHADE.length).toBeGreaterThan(500);
    expect(GENERATED_FRAGMENT).toContain(SHADE);
    expect(SURFACE_FRAGMENT).toContain(SHADE);
    expect(SHADE).toContain("smoothstep(-0.16, 0.95, dot(");
  });

  // The shimmer: detail finer than a pixel aliases as a world turns. Each octave fades out before it is finer than a pixel, the pixel's
  // size taken once in main, where every fragment of a quad takes it.
  it("fades every octave out before a pixel can hold it", () => {
    const fbm = GENERATED_FRAGMENT.slice(
      GENERATED_FRAGMENT.indexOf("vec3 fbm("),
      GENERATED_FRAGMENT.indexOf("float shareOf("),
    );
    expect(fbm).toContain("for (int");
    expect(fbm).toMatch(/smoothstep\([^;]*frequency \* pixel\)/);
    const main = GENERATED_FRAGMENT.slice(GENERATED_FRAGMENT.indexOf("void main()"));
    expect(main).toMatch(/^ {2}float pixel = length\(fwidth\(axis\)\);$/m);
  });

  // A real map is detail only: what it lends is its own fine contrast over its smoothed self, never its shapes or its colours whole.
  it("reads a real map only against its own smoothed self", () => {
    const detail = GENERATED_FRAGMENT.slice(GENERATED_FRAGMENT.indexOf("vec3 detailOf("));
    expect(detail).toMatch(/textureLod\(map, [^;]*DETAIL_BLUR/);
    const elsewhere = GENERATED_FRAGMENT.replace(detail.slice(0, detail.indexOf("\n}\n") + 3), "");
    expect(elsewhere).not.toMatch(/read\((surface|minorMap),/);
  });

  // A GPU takes no derivative and no implicit level inside a branch that varies by pixel (three's guide; 7b's learnings): every read
  // names its level or its gradients.
  it("reads no texture at an implicit level", () => {
    expect(GENERATED_FRAGMENT).not.toMatch(/\btexture2D\(|\btexture\(/);
  });

  it("goes through the one grade, the tone first, then the screen's colours (ADR-0002 §10)", () => {
    const tone = GENERATED_FRAGMENT.indexOf("#include <tonemapping_fragment>");
    expect(tone).toBeGreaterThan(0);
    expect(GENERATED_FRAGMENT.indexOf("#include <colorspace_fragment>")).toBeGreaterThan(tone);
  });
});
