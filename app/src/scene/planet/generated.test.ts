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
import { createWorld, styleOf, worldOf, worldUniforms, type World } from "./generated.ts";
import { GENERATED_FRAGMENT } from "./generatedShader.ts";
import type { MapSet, Planet } from "./planet.ts";
import { SHADE } from "./surfaceParts.ts";
import { SURFACE_FRAGMENT, SURFACE_VERTEX } from "./surfaceShader.ts";
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

  // A uniform the program does not declare is dropped without a word; the program then fails to compile, which only a journey sees.
  it("declares every uniform a world hands its program", () => {
    for (const anchor of ANCHORS)
      for (const name of Object.keys(worldUniforms(worldAt(anchor), fixed().set)))
        expect(`${SURFACE_VERTEX}\n${GENERATED_FRAGMENT}`, name).toMatch(new RegExp(`uniform \\w+ [^;]*\\b${name}\\b`));
  });

  // Ganymede's lanes (7b6's held details, 7b7): grooved ice alone cuts grooves, by a value its look hands the one program.
  it("marks grooved ice's lanes by value, on that class alone", () => {
    for (const anchor of ANCHORS)
      expect(read(drawn(worldAt(anchor)).surface, "grooved"), anchor).toBe(anchor === "grooved ice" ? 1 : 0);
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
    if (ocean.recipe.sea === null) throw new Error("an ocean world has a sea");
    // Its sea as the recipe turns it by its system's hue (Alexis, 2026-11-03, "bleu-vert variant").
    expect(read(drawn(ocean).surface, "seaShallow")).toEqual(linear(ocean.recipe.sea.linear[0]));
    expect(read(drawn(ocean).surface, "seaDeep")).toEqual(linear(ocean.recipe.sea.linear[1]));
    expect(read(drawn(worldAt("rocky")).surface, "seaDeep")).toEqual(linear([0, 0, 0]));
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
  const bodyOf = (signature: string) => {
    const from = GENERATED_FRAGMENT.slice(GENERATED_FRAGMENT.indexOf(signature));
    return from.slice(0, from.indexOf("\n}\n"));
  };

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
      GENERATED_FRAGMENT.indexOf("vec4 fbm("),
      GENERATED_FRAGMENT.indexOf("float shareOf("),
    );
    expect(fbm).toContain("for (int");
    expect(fbm).toMatch(/smoothstep\([^;]*frequency \* pixel\)/);
    const main = GENERATED_FRAGMENT.slice(GENERATED_FRAGMENT.indexOf("void main()"));
    expect(main).toMatch(/^ {2}float pixel = length\(fwidth\(axis\)\);$/m);
  });

  // F4228: an octave fading out takes its weight with it, or the normalised height jumps where it leaves, in a staircase of quads.
  it("fades an octave's weight with its term, so no height jumps where an octave leaves", () => {
    const fbm = GENERATED_FRAGMENT.slice(
      GENERATED_FRAGMENT.indexOf("vec4 fbm("),
      GENERATED_FRAGMENT.indexOf("float shareOf("),
    );
    expect(fbm).toMatch(/sum \+= faded \* n;/);
    expect(fbm).toMatch(/weight \+= faded;/);
    expect(fbm).toMatch(/squares \+= faded \* faded;/);
    const streaks = GENERATED_FRAGMENT.slice(
      GENERATED_FRAGMENT.indexOf("float streaksAt("),
      GENERATED_FRAGMENT.indexOf("float bandsAt("),
    );
    expect(streaks).toMatch(/weight \+= faded;/);
  });

  // Ganymede's grooves (7b6's held details, 7b7; F4323: never a contour map): bright lanes along the seams of large cells, narrow
  // beside a cell, each a bundle of fine dark grooves along its seam, faded out before they are a few pixels apart; a second net turned
  // so the sets cross at angles; the rifts' arcs give way to them, and the broad relief is softer there (F4238's 2x2 steps).
  it("cuts a grooved world's grooves in narrow lanes of two nets that cross, faded before they alias", () => {
    const start = GENERATED_FRAGMENT.indexOf("if (grooved > 0.5) {");
    expect(start).toBeGreaterThan(0);
    const block = GENERATED_FRAGMENT.slice(start, GENERATED_FRAGMENT.indexOf("\n  }\n", start));
    expect(block.match(/groovesAt\(/g)).toHaveLength(2);
    expect(block).toMatch(/groovesAt\(turned\(at, [1-5]\.\d+\) \+ /);
    expect(block).toMatch(
      /albedo \*= mix\(0\.\d+, 1\.\d+, max\(lane, other\)\) \* \(1\.0 - 0\.[2-5]\d* \* min\(grooves, 1\.0\)\);/,
    );
    const grooves = bodyOf("float groovesAt(");
    expect(grooves).toMatch(/float away = seams\(/);
    expect(grooves).toMatch(/lane = 1\.0 - smoothstep\(0\.[0-2]\d*, 0\.[0-3]\d*, away\);/);
    expect(grooves).toMatch(/\* lane \* \(1\.0 - smoothstep\([\d.]+, [\d.]+, [1-9][\d.]* \* frequency \* pixel\)\);/);
    expect(GENERATED_FRAGMENT).toContain("relief * world * (1.0 - 0.3 * grooved), normal);");
  });

  // F4239: a giant's streaks stretched five times across a latitude read as hairs a pixel tall, their octaves past a pixel; Alexis chose
  // the soft version (2026-11-03, 15:2x): each octave stretched twice at most, less as it nears the pixel, faded by its stretched wave,
  // at today's contrast, with no thin filament.
  it("stretches a giant's streaks twice at most, less near the pixel, never five times (F4239)", () => {
    const streaks = bodyOf("float streaksAt(");
    expect(streaks).toMatch(/float stretch = max\(2\.0 - [\d.]+ \* float\(i\), 1\.0\);/);
    expect(streaks).toMatch(/noise\(vec3\(q\.x, q\.y \* stretch, q\.z\) \* frequency/);
    expect(streaks).toContain("if (stretch * frequency * pixel > 0.5) break;");
    expect(streaks).toContain("float faded = amplitude * (1.0 - smoothstep(0.3, 0.5, stretch * frequency * pixel));");
    expect(streaks).not.toMatch(/q\.y \* 5\.0|fwidth/);
    expect(GENERATED_FRAGMENT).toContain("(1.0 + (0.09 + 0.12 * shape.turbulence) * streaksAt(swirled, pixel))");
  });

  // F4229: every finer noise fades by the pixel, the vents' crackle and the bands' second term too, or a small world sparkles.
  it("fades the vents' crackle and the bands' finer term by the pixel", () => {
    expect(GENERATED_FRAGMENT).toMatch(/float crackle = [^;]*fadeAt\(/);
    expect(GENERATED_FRAGMENT).toMatch(/band \+= [^;]*fadeAt\(/);
  });

  // F4227: a storm is drawn by the cell its centre lies in, so its whole disc lies inside the cells a point visits: never cut by a line.
  it("keeps a storm whole, drawn only by the cell its centre lies in", () => {
    expect(GENERATED_FRAGMENT).toContain("if (ivec3(floor(centre * 2.5 + offset)) != cell) continue;");
  });

  // F4230: the Earth's real cloud map is its own weather: on a generated world the cover is its own noise, the map lending detail only.
  it("draws a generated world's clouds from its own noise, the Earth's cloud map for detail only", () => {
    const main = GENERATED_FRAGMENT.slice(GENERATED_FRAGMENT.indexOf("void main()"));
    expect(main).not.toContain("clouded(");
    expect(main).toContain("cloudsOver(");
    expect(SURFACE_FRAGMENT).toContain("cloudsOver(");
  });

  // Its noise's share mapped through the Earth's cloud map's own distribution (its nine deciles, weighted by area: 0.004 to 0.584,
  // fitted by 0.736 u^2.19 within 0.01), so `clouds` covers a generated sky as much as it covered the map: a uniform share covered four
  // times more (31.6% against 7.6% at 0.5), and an ocean's lights fell faintest under it (realism.spec, "a net, the brightest").
  it("covers a generated sky as the Earth's cloud map does at the same share", () => {
    const sky = GENERATED_FRAGMENT.slice(GENERATED_FRAGMENT.indexOf("float skyAt("));
    expect(sky.slice(0, sky.indexOf("\n}\n"))).toMatch(/return 0\.736 \* pow\(shareOf\(/);
    expect(sky.slice(0, sky.indexOf("\n}\n"))).toMatch(/\), 2\.19\);/);
  });

  // F4233: no minor, or a banded world, reads no minor's map.
  it("reads the minor's map only where a minor shows on a ground", () => {
    expect(GENERATED_FRAGMENT).toMatch(/if \(minorShare > 0\.002 && banded < 0\.5\) \{[^}]*detailOf\(minorMap/);
  });

  // F4238: relief shaded from screen derivatives comes out in 2x2 blocks wherever it holds detail under a few pixels: the relief keeps
  // octaves of 8 pixels and more, no map detail, and craters whose rims stay wider than a pixel and a half.
  it("shades a relief smooth over a quad: no map detail in it, craters faded before their rims are thinner than a pixel", () => {
    expect(GENERATED_FRAGMENT).not.toMatch(/relieved \+= fine/);
    // Craters leave the relief while their cells are under 40 px (7b6, F4238: rims steeper than a quad stepped in 2x2 blocks).
    expect(GENERATED_FRAGMENT).toMatch(
      /relieved = ground\.z \/ ground\.y \+ big \* 0\.8 \* \(1\.0 - smoothstep\(0\.012, 0\.03,/,
    );
  });

  // F4240: rifts as warped ridges of varying width, never the cell edges of a polygon net.
  it("draws rifts as warped ridges, never a polygon net", () => {
    const lines = GENERATED_FRAGMENT.slice(GENERATED_FRAGMENT.indexOf("float lines("));
    expect(lines.slice(0, lines.indexOf("\n}\n"))).not.toContain("seams(");
    expect(lines).toMatch(/abs\(noise\(/);
  });

  // F4243: erosion carves the relief, not the share of land: the sea's level reads the plain fBm, whose spread the logistic assumes.
  it("floods by the plain fBm's share, so erosion moves no coast", () => {
    expect(GENERATED_FRAGMENT).toContain("t = shareOf(ground.wy);");
  });

  // F4239, F4241: a storm turns 1.5 radians at most and lies along its band; an ice margin wanders by a third of the pole's height.
  it("turns a storm 1.5 radians at most, and wanders an ice margin", () => {
    expect(GENERATED_FRAGMENT).toMatch(/float turn = \(1\.0 - d\) \* \(1\.0 - d\) \* 1\.5 \*/);
    expect(GENERATED_FRAGMENT).toMatch(/float pole = abs\(axis\.y\) \+ 0\.3 \*/);
  });

  // The look pass (the chief, 7b5; F4237): the approved volcanic character, white-hot vents in organic patches on a dark crust, from the
  // ground's own low places cut by a fine crackle. A young crust, uncratered (volcanic, lava), glows there and never along its rifts,
  // which drew red squiggles; an old one, cratered (shattered), only through its fractures, as the approved shattered world does.
  it("lights white-hot vents in a young crust's low ground, and an old crust's glow in its fractures alone", () => {
    const start = GENERATED_FRAGMENT.indexOf("if (glowLevel > 0.0) {\n    float hot");
    const glow = GENERATED_FRAGMENT.slice(start, GENERATED_FRAGMENT.indexOf("\n  }\n", start));
    expect(GENERATED_FRAGMENT).toMatch(/molten = shareOf\(vec2\([\d.]+ \* crackle - height, /);
    expect(glow).toMatch(/: smoothstep\(hot - [\d.]+, hot \+ [\d.]+, molten\);/);
    expect(glow).toMatch(/float heat = mix\(vents, burning \* [^;]*, smoothstep\([\d.]+, [\d.]+, shape\.craters\)\);/);
    expect(glow).not.toMatch(/seam/);
  });

  // An old crust's fractures (the chief, 7b5's pass2: Music's veins, never neon tubes; 7b6's held details, 7b7): cracks along the seams
  // of cells, a few to a radius, which glow only where they are wider than a pixel and a half; a riven world that does not glow keeps
  // its long crossing arcs.
  it("breaks an old crust's fractures along the seams of cells, glowing on their wider parts only", () => {
    expect(GENERATED_FRAGMENT).toMatch(
      /if \(riven > 0\.0 && glowLevel > 0\.0\) \{\n {6}vec2 crack = crackAt\(at \+ offset, [1-5]\.0 \+ shape\.scale, vec2\(0\.0[1-9]\d*, 0\.[01]\d* \+ 0\.[01]\d* \* shape\.rifts\), pixel\);/,
    );
    // No arm tapers to a point, and the glow keeps to a crack's middle, its profile squared: 7b7's design review saw starfish and smears.
    expect(GENERATED_FRAGMENT).toMatch(/burning = rift \* rift \* smoothstep\([1-9][\d.]*, [\d.]+, crack\.y\);/);
    expect(GENERATED_FRAGMENT).toMatch(/\} else if \(riven > 0\.0\) rift = lines\(ridge, at, /);
  });

  // The concentric marbling (the chief: real24's fourth world): erosion carved the two largest octaves too, whose few long creases the
  // warp bends into arcs a grazing light terraces in 2x2 steps; carving starts at the third octave, its crease rounded.
  it("keeps craters round: they are placed on the ground's point before its warp, never stretched with it (7b5's design pass, 7)", () => {
    expect(GENERATED_FRAGMENT).toContain("vec3 round = at + offset;");
    expect(GENERATED_FRAGMENT).toContain("cratersAt(round, shape.scale * 4.0, pixel)");
    expect(GENERATED_FRAGMENT).toContain("cratersAt(round, shape.scale * 13.0, pixel)");
    expect(GENERATED_FRAGMENT).not.toMatch(/cratersAt\(p, /);
  });

  // F4335: an ocean world's continents would leave its close view open sea: a sea of 0.8 or more keeps its archipelagos, the ground's
  // own field; a temperate world's sea (0.55 to 0.78) gathers its land in continents.
  it("gathers land in continents only where the sea leaves room for them", () => {
    expect(GENERATED_FRAGMENT).toContain("if (shape.sea > 0.0 && shape.sea < 0.8) {");
  });

  it("carves only the finer octaves, their crease rounded", () => {
    // The crease no narrower than the close view's pixels three times over, the same for every pixel of a quad (7b6, F4238).
    expect(GENERATED_FRAGMENT).toMatch(/float crease = max\(0\.02, [\d.]+ \* frequency\);/);
    expect(GENERATED_FRAGMENT).toMatch(
      /n \+= carved \* step\(1\.5, float\(i\)\) \* \(2\.0 \* \(sqrt\(n \* n \+ crease \* crease\) - HOLLOW\) - n\);/,
    );
  });

  // Fractures as bands (the chief, after Europa's lineae and Enceladus's stripes): a width that swells and narrows along each, a tint,
  // and raised margins in the relief, never a line of one width.
  it("draws a rift as a band whose width varies along it, tinted and relieved", () => {
    const band = GENERATED_FRAGMENT.slice(GENERATED_FRAGMENT.indexOf("float lines("));
    expect(band.slice(0, band.indexOf("\n}\n"))).toMatch(/width \*= [\d.]+ \+ [\d.]+ \* smoothstep\(/);
    expect(GENERATED_FRAGMENT).toMatch(/relieved \+= [^;]*ridge/);
    expect(GENERATED_FRAGMENT).toMatch(/albedo = mix\(albedo, riftTint, /);
  });

  // Europa's lineae (the chief, 7b5's second look): long, gently curved arcs crossing at angles across the disc, few of them, each a dark
  // band between two light ridges; the arcs are small circles about the world's own axes, broken into long runs.
  it("draws rifts as long crossing arcs with a doubled profile", () => {
    const band = GENERATED_FRAGMENT.slice(GENERATED_FRAGMENT.indexOf("float lines("));
    const body = band.slice(0, band.indexOf("\n}\n"));
    expect(body).toMatch(/for \(int k = 0; k < 8; k\+\+\)/);
    expect(body).toMatch(/dot\(at, /);
    expect(GENERATED_FRAGMENT).toMatch(/rift = lines\(ridge, at, /);
    // Only a riven world shows them (rocky's rifts reach 0.2, desert's 0.4, ice's start at 0.4): thin arcs on the rest read as ink.
    expect(GENERATED_FRAGMENT).toContain("float riven = smoothstep(0.25, 0.5, shape.rifts) * (1.0 - grooved);");
    expect(GENERATED_FRAGMENT).toMatch(/albedo \*= 1\.0 \+ [\d.]+ \* max\(ridge, 0\.0\)/);
  });

  // The minor's edge frays as a coast does (the chief): the ground's octaves between 8 and 2 pixels break it, never finer, so no speck.
  it("frays the minor's edge with the ground's own finer octaves", () => {
    expect(GENERATED_FRAGMENT).toMatch(/fray = \(ground\.x - ground\.z\) \/ ground\.y;/);
    expect(GENERATED_FRAGMENT).toMatch(/\* 0\.77 \+ [\d.]+ \* fray;/);
  });

  // The minor through the structure (the chief; F4245): on a ground, the broad height (a finer term flips its edge into specks) and the
  // latitude, at a narrow edge; on a giant, whole bands, 60% of the way to the main class's lightness (darker, they dimmed the night's
  // lights under the grade's toe: realism.spec's belts; matched, a dark giant lost its detail); a glowing crust's own. Never a soft blob.
  it("draws the minor through the ground's structure, at a narrow edge", () => {
    expect(GENERATED_FRAGMENT).toMatch(/float z = \(patches\.x \/ patches\.y \+ [\d.]+ \* broad \+ [\d.]+ \* pole\)/);
    // A giant's minor is whole bands, from the latitude alone (7b6, F4245).
    expect(GENERATED_FRAGMENT).toMatch(
      /z = noise\(vec3\(swirled\.y \* max\(shape\.bands \* [\d.]+, [\d.]+\), minorOffset\.xy\)\) \/ SPREAD;/,
    );
    expect(GENERATED_FRAGMENT).toMatch(/float edge = 0\.0[0-4]\d*;/);
    // A giant's band minor covers its share: its soft edge half its share wide, so a minor that barely shows moves little (7b7).
    expect(GENERATED_FRAGMENT).toContain("edge = min(0.1, 0.5 * minorShare);");
    expect(GENERATED_FRAGMENT).toContain("minor = smoothstep(1.0 - minorShare - edge, 1.0 - minorShare + edge,");
    // A dark ground's minor takes its main class's lightness, as a glowing world's does; a giant's keeps 0.6 of it (7b6).
    expect(GENERATED_FRAGMENT).toMatch(
      /float matched = max\(step\(0\.001, glowLevel\), banded > 0\.5 \? 0\.6 : 1\.0 - smoothstep\([\d.]+, [\d.]+, dot\(mid, LUMA\)\)\);/,
    );
    expect(GENERATED_FRAGMENT).toContain(
      "second *= mix(1.0, dot(major, LUMA) / max(dot(second, LUMA), 1e-4), matched);",
    );
  });

  // Fidelity (the chief, 7b5): a real map's fine contrast shades the ground too, as the approved base and the Earth do; its slope read
  // from the map a pixel away, never by a screen derivative, so no 2x2 blocks; the class's relief its strength; a giant has no ground.
  // Its four reads cost 30% of a frame on the real file's 24 (912 ms against 1,181): only where a pixel shows it, a radius past 250 px.
  it("shades the ground by its map's fine contrast, read a pixel away", () => {
    const grained = GENERATED_FRAGMENT.slice(GENERATED_FRAGMENT.indexOf("vec3 grained("));
    expect(grained.slice(0, grained.indexOf("\n}\n"))).toMatch(
      /detailOf\(surface, lookupOf\(spin \* normalize\(at \+ east \* reach\)\)\)/,
    );
    expect(grained.slice(0, grained.indexOf("\n}\n"))).not.toMatch(/dFd[xy]|fwidth/);
    expect(GENERATED_FRAGMENT).toMatch(/if \(banded < 0\.5 && near > 0\.0\) bent = grained\(bent, /);
    expect(GENERATED_FRAGMENT).toMatch(/float near = 1\.0 - smoothstep\(0\.004, 0\.008, pixel\);/);
  });

  // The volcanic styles (Alexis through the chief, 2026-11-03: "on peut avoir plusieurs styles"): a volcanic world takes one of three
  // looks by its seed's byte 18, read back from its minor offset: the approved dark crust with white-hot vents, a network of gold veins
  // glowing day and night (the video's frame 4, "Music"), and a sulfur crust with dark calderas (after Io).
  it("gives a volcanic world one of three styles by its seed, the approved one first, and every other world that one", () => {
    const counts = [0, 0, 0];
    for (let at = 0; at < 300; at += 1) {
      const world = worldAt("volcanic", asciiBytes(`gno.land/r/demo/fire${String(at)}`));
      const style = styleOf(world);
      const byte = Math.round((world.look.minorOffset[0] * 255) / 16);
      expect(style).toBe(byte % 3);
      expect(worldUniforms(world, fixed().set)["style"]?.value).toBe(style);
      counts[style] = (counts[style] ?? 0) + 1;
    }
    for (const count of counts) expect(count).toBeGreaterThan(70);
    expect(styleOf(worldAt("rocky"))).toBe(0);
    expect(styleOf(worldAt("lava world"))).toBe(0);
  });

  it("draws each style from its uniform: veins glowing on the night side too, a sulfur crust with calderas", () => {
    const start = GENERATED_FRAGMENT.indexOf("if (glowLevel > 0.0) {\n    float hot");
    const glow = GENERATED_FRAGMENT.slice(start, GENERATED_FRAGMENT.indexOf("\n  }\n", start));
    expect(glow).toMatch(/if \(style > 0\.5 && style < 1\.5\) glow = veinsOf\(at \+ offset, /);
    expect(GENERATED_FRAGMENT).not.toMatch(/veinsAt\(|goldOf\(/);
    expect(GENERATED_FRAGMENT).toMatch(/if \(style > 1\.5\) albedo = rampOf\(sulfurLow, sulfurMid, sulfurHigh, tint\)/);
  });

  // Frame 4's Music (7b6's held details, 7b7): a net of veins in two sizes, gold to orange, never white; each vein a crack along the seams
  // of cells, its width wandering between two bounds, and a crack under a pixel wide fades out whole, never a hairline that breaks up.
  it("draws a veined world's veins as two nets of cracks, gold to orange, each faded out whole under a pixel", () => {
    const crack = bodyOf("vec2 crackAt(");
    expect(crack).toMatch(/float away = seams\(/);
    expect(crack).toMatch(/float wide = mix\(width\.x, width\.y, smoothstep\(/);
    expect(crack).toMatch(/float seen = [1-9]\d*\.0 \* frequency \* pixel;/);
    expect(crack).toContain(
      "return vec2((1.0 - smoothstep(0.0, max(wide, seen), away)) * smoothstep(0.5, 1.5, wide / seen), wide / seen);",
    );
    const veins = bodyOf("vec3 veinsOf(");
    expect(veins.match(/crackAt\(/g)).toHaveLength(2);
    expect(veins).toMatch(/vec2 main = crackAt\(p, [\d.]+ \+ shape\.scale, vec2\(0\.1\d*, 0\.[3-5]\d*\), pixel\);/);
    expect(veins).toMatch(/float heat = max\(main\.x, 0\.[1-9]\d* \* fine\.x\);/);
    expect(veins).toMatch(/rampOf\(vec3\([^)]*\), vec3\([^)]*\), vec3\(1\.0, 0\.[3-7]\d*, 0\.[01]\d*\), heat\)/);
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
