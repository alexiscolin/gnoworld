import { ANCHORS, planetLook, type PlanetLook } from "@gnoworld/core";
import {
  Color,
  Euler,
  Matrix3,
  Matrix4,
  Mesh,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { AIR_FRAGMENT } from "./airShader.ts";
import { createPlanet, type MapSet, type Planet } from "./planet.ts";
import { RING_FRAGMENT } from "./ringShader.ts";
import { SURFACE_FRAGMENT } from "./surfaceShader.ts";

const ascii = (text: string): Uint8Array => Uint8Array.from(text, (character) => character.charCodeAt(0));
const DAO = ascii("gno.land/r/gov/dao");

const fixed = () => {
  const textures = new Map<string, Texture>();
  const set: MapSet = {
    map: (name) => {
      const texture = textures.get(name) ?? new Texture();
      textures.set(name, texture);
      return texture;
    },
    clouds: new Texture(),
    ring: new Texture(),
  };
  return { set, textures };
};

const sphere = new SphereGeometry(1, 8, 6);
const lookWith = (anchor: (typeof ANCHORS)[number], rings: boolean): PlanetLook => {
  for (let i = 0; i < 500; i += 1) {
    const look = planetLook(ascii(`gno.land/r/demo/ringed${String(i)}`), anchor);
    if ((look.rings !== null) === rings) return look;
  }
  throw new Error(`no ${anchor} in 500 paths with rings ${String(rings)}`);
};
const meshes = (planet: Planet): Mesh[] =>
  planet.group.children.filter((child): child is Mesh => child instanceof Mesh);
const read = (material: ShaderMaterial, name: string): unknown => material.uniforms[name]?.value;
const materialOf = (mesh: Mesh): ShaderMaterial => {
  if (mesh.material instanceof ShaderMaterial) return mesh.material;
  throw new Error("not a shader material");
};
const linear = ([red, green, blue]: readonly [number, number, number]) =>
  new Color().setRGB(red, green, blue, SRGBColorSpace);

describe("createPlanet", () => {
  it.each([...ANCHORS])("draws %s's surface, then its air and rings if it has them", (anchor) => {
    const look = lookWith(anchor, false);
    const parts = meshes(createPlanet(look, fixed().set, sphere));
    expect(parts.map((part) => part.geometry)).toEqual(look.rim === null ? [sphere] : [sphere, sphere]);
  });

  it("adds the rings' own mesh last", () => {
    const look = lookWith("gas giant", true);
    const parts = meshes(createPlanet(look, fixed().set, sphere));
    expect(parts).toHaveLength(3);
    expect(parts[2]?.geometry).toBeInstanceOf(RingGeometry);
  });

  it("asks for the look's two maps, by name", () => {
    const look = planetLook(DAO, "temperate");
    const { set, textures } = fixed();
    const planet = createPlanet(look, set, sphere);
    expect(read(planet.surface, "surface")).toBe(textures.get(look.map));
    expect(read(planet.surface, "second")).toBe(textures.get(look.second));
    expect(read(planet.surface, "cloudMap")).toBe(set.clouds);
  });

  it("shares one program among all twelve: the shader's text never holds a look", () => {
    const [first, ...others] = ANCHORS.map((anchor) => createPlanet(planetLook(DAO, anchor), fixed().set, sphere));
    if (first === undefined) throw new Error("no anchors");
    for (const other of others) {
      expect(other.surface.fragmentShader).toBe(first.surface.fragmentShader);
      expect(other.surface.vertexShader).toBe(first.surface.vertexShader);
      expect(other.surface.defines).toEqual(first.surface.defines);
    }
  });

  it("hands every colour of the surface in the working space, each stop to its own uniform", () => {
    const look = planetLook(DAO, "temperate");
    const surface = createPlanet(look, fixed().set, sphere).surface;
    const [low, mid, high] = look.ramp;
    expect(read(surface, "rampLow")).toEqual(linear(low));
    expect(read(surface, "rampMid")).toEqual(linear(mid));
    expect(read(surface, "rampHigh")).toEqual(linear(high));
    if (look.sea === null) throw new Error("a temperate world has a sea");
    expect(read(surface, "seaShallow")).toEqual(linear(look.sea.shallow));
    expect(read(surface, "seaDeep")).toEqual(linear(look.sea.deep));
  });

  it("hands every number of the surface to its own uniform", () => {
    const look = planetLook(DAO, "temperate");
    const surface = createPlanet(look, fixed().set, sphere).surface;
    expect(read(surface, "warpAmount")).toBe(look.warp.amount);
    expect(read(surface, "warpFrequency")).toBe(look.warp.frequency);
    expect(read(surface, "warpOffset")).toEqual(new Vector3(...look.warp.offset));
    expect(read(surface, "secondShare")).toBe(look.secondShare);
    expect(read(surface, "cloudCover")).toBe(look.clouds);
    expect(read(surface, "relief")).toBe(look.relief);
    expect(read(surface, "limb")).toBe(look.limb);
    expect(read(surface, "recolour")).toBe(look.recolour);
    expect(read(surface, "contrast")).toBe(look.contrast);
    expect(read(surface, "cracks")).toBe(look.cracks);
    expect(read(surface, "caps")).toBe(look.caps);
    expect(read(surface, "seaLevel")).toBe(look.sea?.level);
  });

  it("marks what a world lacks by value, for one program holds every world", () => {
    const surface = createPlanet(planetLook(DAO, "rocky"), fixed().set, sphere).surface;
    expect(read(surface, "seaLevel")).toBe(-1);
    expect(read(surface, "glowLevel")).toBe(0);
    expect(read(surface, "locked")).toBe(0);
  });

  it("hands a glow, a lock and rifts to the surface", () => {
    const volcanic = planetLook(DAO, "volcanic");
    const lava = createPlanet(volcanic, fixed().set, sphere).surface;
    expect(read(lava, "glowLevel")).toBe(volcanic.glow?.level);
    if (volcanic.glow === null) throw new Error("a volcanic world glows");
    expect(read(lava, "glowColour")).toEqual(linear(volcanic.glow.colour));
    expect(read(createPlanet(planetLook(DAO, "tidally locked"), fixed().set, sphere).surface, "locked")).toBe(1);
    const shattered = planetLook(DAO, "shattered");
    expect(read(createPlanet(shattered, fixed().set, sphere).surface, "rifts")).toBe(shattered.rifts);
  });

  it("hands the air its colour and thickness", () => {
    const look = planetLook(DAO, "temperate");
    const shell = meshes(createPlanet(look, fixed().set, sphere))[1];
    if (shell === undefined || look.rim === null) throw new Error("no shell");
    const surface = materialOf(shell);
    expect(read(surface, "rimColour")).toEqual(linear(look.rim.colour));
    expect(read(surface, "rimThickness")).toBe(look.rim.thickness);
    expect(shell.scale.x).toBeCloseTo(1 + look.rim.thickness, 10);
  });

  it("hands the rings their colour, their reach and the shared profile", () => {
    const look = lookWith("gas giant", true);
    const { set } = fixed();
    const planet = createPlanet(look, set, sphere);
    const ring = meshes(planet).at(-1);
    if (ring === undefined || look.rings === null) throw new Error("no rings");
    const surface = materialOf(ring);
    expect(read(surface, "ringTint")).toEqual(linear(look.rings.tint));
    expect(read(surface, "ringOpacity")).toBe(look.rings.opacity);
    expect(read(surface, "ringInner")).toBe(look.rings.inner);
    expect(read(surface, "ringOuter")).toBe(look.rings.outer);
    expect(read(surface, "ringMap")).toBe(set.ring);
    expect(read(planet.surface, "ringMap")).toBe(set.ring);
    expect(read(planet.surface, "ringInner")).toBe(look.rings.inner);
    expect(read(planet.surface, "ringOuter")).toBe(look.rings.outer);
  });

  // Inside a branch that varies by pixel a GPU cannot take its own derivatives: an implicit level is undefined there, which a software
  // renderer never shows.
  it("reads the ring's shadow at a level it names", () => {
    expect(SURFACE_FRAGMENT).toContain("textureLod(ringMap,");
    expect(SURFACE_FRAGMENT).not.toContain("texture2D(ringMap,");
  });

  // The grain on a real GPU: east and across differ by a whole number but fract() rounds each its own way, so choosing between them by
  // comparing their fwidth() flipped from pixel to pixel; a quad whose pixels chose differently took dFdx() across a whole map (a lowest
  // mip, a stray texel), and the choice moved with the turn: a shimmer. Software renderers round alike and never show it.
  it("never picks the map's seam by comparing derivatives, which flips per pixel on a real GPU", () => {
    expect(SURFACE_FRAGMENT).not.toMatch(/fwidth\(east\)\s*<=?\s*fwidth\(across\)/);
    expect(SURFACE_FRAGMENT).not.toMatch(/dFdx\(uv\)|dFdy\(uv\)/);
  });

  it("takes each candidate longitude's own derivatives, so no quad mixes two of them", () => {
    for (const name of ["east", "across"])
      for (const axis of ["dFdx", "dFdy"]) expect(SURFACE_FRAGMENT).toContain(`${axis}(${name})`);
  });

  // The shimmer: detail finer than a pixel aliases as the world turns. Each kind is held to the pixel's own size.
  it("shades relief a pixel away, never a texel, and soft-clips its slope", () => {
    expect(SURFACE_FRAGMENT).toContain("length(fwidth(axis))");
    expect(SURFACE_FRAGMENT).toMatch(/slope \/= 1\.0 \+/);
  });

  it("keeps a crack or a rift at least a pixel wide, and the sea's glint off a field finer than a pixel", () => {
    expect(SURFACE_FRAGMENT).toContain("fwidth(away)");
    expect(SURFACE_FRAGMENT).not.toContain("direction * 90.0");
  });

  it("casts no ring's shadow on a world with no rings", () => {
    const surface = createPlanet(lookWith("gas giant", false), fixed().set, sphere).surface;
    expect(read(surface, "ringOuter")).toBe(0);
  });

  it("lights no city on a world with no night map: every world but the Earth stays as it was", () => {
    const surface = createPlanet(planetLook(DAO, "temperate"), fixed().set, sphere).surface;
    expect(read(surface, "nightLights")).toBe(0);
  });

  it("hands the shader a night map when a set holds one", () => {
    const night = new Texture();
    const surface = createPlanet(planetLook(DAO, "temperate"), { ...fixed().set, night }, sphere).surface;
    expect(read(surface, "nightLights")).toBe(1);
    expect(surface.uniforms["nightMap"]?.value).toBe(night);
  });

  it("leaves the edge of a world's air to its scattering, unless it is asked to light it", () => {
    const planet = createPlanet(lookWith("temperate", false), fixed().set, sphere);
    const air = meshes(planet)[1]?.material as ShaderMaterial;
    expect(air.uniforms["limbLight"]?.value).toBe(0);
    planet.setLimb(0.7);
    expect(air.uniforms["limbLight"]?.value).toBe(0.7);
  });

  it("keeps the cities to the dark side, and off the day", () => {
    expect(SURFACE_FRAGMENT).toMatch(/float dusk = 1\.0 - smoothstep\([^)]*, day\)/);
    expect(SURFACE_FRAGMENT).toMatch(/colour \+= [^;]*dusk/);
  });

  it("dims the cities under the clouds", () => {
    expect(SURFACE_FRAGMENT).toMatch(/colour \+= [^;]*overcast/);
  });

  it("never asks a smoothstep with its edges reversed, which GLSL leaves undefined and a software GPU hides", () => {
    for (const shader of [SURFACE_FRAGMENT, AIR_FRAGMENT, RING_FRAGMENT])
      for (const [, low = "0", high = "0"] of shader.matchAll(/smoothstep\((-?[\d.]+), (-?[\d.]+),/g))
        expect(Number(low), shader.slice(0, 40)).toBeLessThan(Number(high));
  });

  it("leaves a generated world's air as 7b drew it: the softer terminator waits behind the Earth's limb", () => {
    expect(AIR_FRAGMENT).toContain(
      "float lit = smoothstep(1.0 - scale * 0.2, 1.0 + scale * 2.0, dot(at, sun) < 0.0 ? across : 2.0);",
    );
    expect(AIR_FRAGMENT).toMatch(/if \(limbLight > 0\.0\) lit = /);
  });

  it("tints the halo of a world's air with the air's own colour, lifted, and gives an airless world none", () => {
    const look = planetLook(DAO, "temperate");
    if (look.rim === null) throw new Error("a temperate world has air");
    const surface = createPlanet(look, fixed().set, sphere).surface;
    const halo = read(surface, "hazeColour") as Color;
    const own = linear(look.rim.colour);
    expect(halo.b).toBeGreaterThan(own.b);
    expect(halo.b).toBeLessThan(1);
    expect(halo.b / halo.r).toBeGreaterThan(1);
    expect(read(surface, "hazeAmount")).toBeGreaterThan(0.3);
    const bare = createPlanet(planetLook(DAO, "rocky"), fixed().set, sphere).surface;
    expect(read(bare, "hazeAmount")).toBe(0);
  });

  it("draws a thinner halo for a thinner air, never none", () => {
    const amounts = ["temperate", "volcanic"].map((anchor) =>
      read(
        createPlanet(planetLook(DAO, anchor as (typeof ANCHORS)[number]), fixed().set, sphere).surface,
        "hazeAmount",
      ),
    );
    const [thick = 0, thin = 0] = amounts as number[];
    expect(thin).toBeGreaterThan(0);
    expect(thin).toBeLessThan(thick);
  });

  it("lights the edge of every world: the air's halo where there is air, a thin edge of sunlight where there is none", () => {
    expect(SURFACE_FRAGMENT).toMatch(/if \(air > 0\.5\) colour = mix\(colour, hazeColour, rim \* hazeAmount\);/);
    expect(SURFACE_FRAGMENT).toMatch(/else colour \+= EDGE \* sunlight \* pow\(1\.0 - facing, 5\.0\)/);
  });

  it("softens the light towards the terminator on every world, as the Earth's", () => {
    expect(SURFACE_FRAGMENT).toContain("max(limb, mix(SOFT_BARE, SOFT_AIR, air))");
  });

  it("fades the day into the night over a wide arc, smooth at both ends, and gives the star no colour of its own", () => {
    expect(SURFACE_FRAGMENT).toContain("smoothstep(-0.16, 0.95, dot(bumped(");
    expect(SURFACE_FRAGMENT).not.toContain("pow(light, 1.0 - 0.3");
    expect(SURFACE_FRAGMENT).toContain("vec3 sunlight = vec3(SUN);");
  });

  it("switches the Earth's city lights on across the arc the day goes out in", () => {
    expect(SURFACE_FRAGMENT).toContain("float dusk = 1.0 - smoothstep(-0.16, 0.4, day);");
  });

  it("dims a ring in its world's shadow and never cuts it, the hole at a ring's lower right having been a bug", () => {
    expect(RING_FRAGMENT).toMatch(/const float SHADED = 0\.[1-9]/);
    expect(RING_FRAGMENT).toContain("float lit = mix(SHADED, 1.0, smoothstep(0.9, 1.1, past));");
  });

  it("tilts a world's axis, its rings with it", () => {
    const look = lookWith("gas giant", true);
    const planet = createPlanet(look, fixed().set, sphere);
    expect(planet.group.rotation.z).toBe(look.tilt);
    expect(planet.group.rotation.x).toBe(look.lean);
    expect(meshes(planet).at(-1)?.parent).toBe(planet.group);
  });

  it("turns its map by the look's angles", () => {
    const look = planetLook(DAO, "rocky");
    const planet = createPlanet(look, fixed().set, sphere);
    const wanted = new Matrix3().setFromMatrix4(
      new Matrix4().makeRotationFromEuler(new Euler(look.spin[1], look.spin[0], look.spin[2], "YXZ")),
    );
    expect(read(planet.surface, "spin")).toEqual(wanted);
  });

  it("gives every part of a world the one sun, as a copy", () => {
    const planet = createPlanet(lookWith("gas giant", true), fixed().set, sphere);
    const sun = new Vector3(1, 0, 0);
    planet.setSun(sun);
    for (const part of meshes(planet)) {
      const value = read(materialOf(part), "sun") as Vector3;
      expect(value.equals(sun)).toBe(true);
      expect(value).not.toBe(sun);
    }
  });

  it("moves its clouds by the time it is told", () => {
    const planet = createPlanet(planetLook(DAO, "temperate"), fixed().set, sphere);
    planet.setTime(120);
    expect(read(planet.surface, "time")).toBe(120);
  });

  it("frees what it made and leaves what it shares, once", () => {
    const { set, textures } = fixed();
    const look = lookWith("gas giant", true);
    const clouds = vi.spyOn(set.clouds, "dispose");
    const ring = vi.spyOn(set.ring, "dispose");
    const geometry = vi.spyOn(sphere, "dispose");
    const planet = createPlanet(look, set, sphere);
    const shared = [...textures.values()].map((texture) => vi.spyOn(texture, "dispose"));
    const owned = meshes(planet).map((part) => vi.spyOn(materialOf(part), "dispose"));
    const ringMesh = meshes(planet).at(-1);
    if (ringMesh === undefined) throw new Error("no rings");
    const ringGeometry = vi.spyOn(ringMesh.geometry, "dispose");
    planet.dispose();
    planet.dispose();
    for (const dispose of [...owned, ringGeometry]) expect(dispose).toHaveBeenCalledOnce();
    for (const dispose of [clouds, ring, geometry, ...shared]) expect(dispose).not.toHaveBeenCalled();
  });
});
