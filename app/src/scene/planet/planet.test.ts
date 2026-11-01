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
import { createPlanet, type MapSet, type Planet } from "./planet.ts";

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

  it("casts no ring's shadow on a world with no rings", () => {
    const surface = createPlanet(lookWith("gas giant", false), fixed().set, sphere).surface;
    expect(read(surface, "ringOuter")).toBe(0);
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
