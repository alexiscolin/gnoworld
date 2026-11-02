import {
  ANCHORS,
  asciiBytes,
  LIGHT_KINDS,
  planetLook,
  planetSeed,
  worldSigns,
  type Anchor,
  type PlanetLook,
  type WorldState,
} from "@gnoworld/core";
import { createHash } from "node:crypto";
import {
  CustomBlending,
  FrontSide,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  SphereGeometry,
  Texture,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { createPlanet, type MapSet } from "./planet.ts";
import { LIGHT_UNIFORMS, LIGHTS, lightCode } from "./signShaders.ts";
import { SURFACE_FRAGMENT } from "./surfaceShader.ts";

// A world's signs on its render (slice 7, 7b2): a world at rest carries none, so the program, the meshes and every uniform are the ones
// the lab drew, and the signs a stage adds only ever add light.
const PATH = asciiBytes("gno.land/r/gov/dao");
const SEED = planetSeed(PATH);
const REST: WorldState = { vitality: 0.1, present: 0, fresh: false };
const BUSY: WorldState = { vitality: 0.8, present: 0.6, fresh: false };
const NEW: WorldState = { vitality: 0.1, present: 0.4, fresh: true };
const sphere = new SphereGeometry(1, 8, 6);
// What 21b00fc8's SURFACE_FRAGMENT hashes to, computed from that commit's three files.
const APPROVED_SURFACE = "1f2191403f755cd1cc69368caaa43664f3ea4048a4c4fc69dde1f98750244c2a";

const mapSet = (extra: Partial<MapSet> = {}): MapSet => {
  const shared = new Texture();
  return { map: () => shared, clouds: new Texture(), ring: new Texture(), ...extra };
};
const planetOf = (look: PlanetLook, maps = mapSet({ lights: new Texture() })) => createPlanet(look, maps, sphere);
const signsAt = (anchor: Anchor, state: WorldState) => worldSigns(SEED, anchor, state);
const uniform = (material: ShaderMaterial, name: string): unknown => material.uniforms[name]?.value;
const snapshot = (material: ShaderMaterial): [string, unknown][] =>
  Object.entries(material.uniforms).map(([name, { value }]) => {
    const held: unknown = value;
    return [name, held instanceof Vector3 ? held.toArray() : held];
  });
const haloOf = (group: { children: readonly unknown[] }) =>
  group.children.filter(
    (child): child is Mesh<SphereGeometry, ShaderMaterial> =>
      child instanceof Mesh && child.material instanceof ShaderMaterial && "signal" in child.material.uniforms,
  );

describe("a world's signs on its render", () => {
  it.each([...ANCHORS])("leaves %s at rest as it was made: every uniform, every mesh", (anchor) => {
    const planet = planetOf(planetLook(PATH, anchor));
    const before = snapshot(planet.surface);
    const parts = planet.group.children.length;
    planet.setSigns(signsAt(anchor, REST));
    expect(snapshot(planet.surface)).toEqual(before);
    expect(planet.group.children).toHaveLength(parts);
  });

  it("starts with no light at all, sign or no sign: the Earth and every lab view never call it", () => {
    const planet = planetOf(planetLook(PATH, "rocky"));
    expect(uniform(planet.surface, "settled")).toBe(0);
  });

  it("writes a stage's lights: how far they reach, how lit, and the form the world owns", () => {
    const planet = planetOf(planetLook(PATH, "ice"));
    const signs = signsAt("ice", BUSY);
    planet.setSigns(signs);
    const { lights } = signs;
    expect(uniform(planet.surface, "settled")).toBe(lights.extent);
    expect(uniform(planet.surface, "lightLevel")).toBe(lights.level);
    expect(uniform(planet.surface, "lightKind")).toBe(lightCode(lights.kind));
    expect(uniform(planet.surface, "lightGrain")).toBe(lights.grain);
    expect(uniform(planet.surface, "lightFine")).toBe(lights.fine);
    expect(uniform(planet.surface, "lightTurn")).toBe(lights.turn);
    expect((uniform(planet.surface, "lightOffset") as Vector3).toArray()).toEqual([...lights.offset]);
  });

  it("gives each kind of light a code of its own, the first of them 0", () => {
    const codes = LIGHT_KINDS.map(lightCode);
    expect(new Set(codes).size).toBe(LIGHT_KINDS.length);
    expect(Math.min(...codes)).toBe(0);
  });

  it("turns its lights off again on the way back to rest", () => {
    const planet = planetOf(planetLook(PATH, "ice"));
    planet.setSigns(signsAt("ice", BUSY));
    planet.setSigns(signsAt("ice", REST));
    expect(uniform(planet.surface, "settled")).toBe(0);
  });

  it("reads a world's lights from the map it is given, and stays off the Earth's own branch", () => {
    const lights = new Texture();
    const planet = planetOf(planetLook(PATH, "ice"), mapSet({ lights }));
    expect(uniform(planet.surface, "nightMap")).toBe(lights);
    expect(uniform(planet.surface, "nightLights")).toBe(0);
  });

  it("lets the Earth's night stand: its own map and flag come first", () => {
    const night = new Texture();
    const planet = planetOf(planetLook(PATH, "ice"), mapSet({ night, lights: new Texture() }));
    expect(uniform(planet.surface, "nightMap")).toBe(night);
    expect(uniform(planet.surface, "nightLights")).toBe(1);
  });

  it("draws no lights without their map: a sampler holding clouds would read as cities", () => {
    const planet = planetOf(planetLook(PATH, "ice"), mapSet());
    planet.setSigns(signsAt("ice", BUSY));
    expect(uniform(planet.surface, "settled")).toBe(0);
  });

  it("wears a halo for a seed alone, one mesh however often it is told, soft and additive", () => {
    const planet = planetOf(planetLook(PATH, "rocky"));
    expect(haloOf(planet.group)).toHaveLength(0);
    const signs = signsAt("rocky", NEW);
    planet.setSigns(signs);
    planet.setSigns(signs);
    const [halo] = haloOf(planet.group);
    if (halo === undefined) throw new Error("no halo");
    expect(haloOf(planet.group)).toHaveLength(1);
    expect(halo.visible).toBe(true);
    expect(uniform(halo.material, "signal")).toBe(signs.signal);
    expect(halo.material.blending).toBe(CustomBlending);
    expect(halo.material.blendSrc).toBe(OneFactor);
    expect(halo.material.blendDst).toBe(OneMinusSrcAlphaFactor);
    expect(halo.renderOrder, "over the air and the rings of any world").toBeGreaterThan(2);
    expect(halo.material.side).toBe(FrontSide);
    expect(halo.material.depthWrite).toBe(false);
    expect(halo.material.transparent).toBe(true);
    expect(
      halo.scale.x,
      "a shell at the world's own size would lie inside its surface and show nothing",
    ).toBeGreaterThan(1.5);
    planet.setSigns(signsAt("rocky", REST));
    expect(halo.visible).toBe(false);
  });

  it("leaves the world's size to whoever places it: the group's scale is the view's, `size` a factor on it", () => {
    const planet = planetOf(planetLook(PATH, "ice"));
    planet.group.scale.setScalar(3);
    planet.setSigns(signsAt("ice", BUSY));
    planet.setSigns(signsAt("ice", BUSY));
    expect(planet.group.scale.toArray()).toEqual([3, 3, 3]);
  });

  it("still takes the sun and the limb with a halo on", () => {
    const planet = planetOf(planetLook(PATH, "desert"));
    planet.setSigns(signsAt("desert", NEW));
    expect(() => {
      planet.setSun(new Vector3(0, 1, 0));
      planet.setLimb(1);
    }).not.toThrow();
  });

  it("frees the halo with the world", () => {
    const planet = planetOf(planetLook(PATH, "rocky"));
    planet.setSigns(signsAt("rocky", NEW));
    const [halo] = haloOf(planet.group);
    if (halo === undefined) throw new Error("no halo");
    const freed = vi.fn();
    halo.material.addEventListener("dispose", freed);
    planet.dispose();
    expect(freed).toHaveBeenCalledOnce();
  });

  // The 0 px apart in the render Alexis approved, kept: the hash of the surface shader of 21b00fc8, this file's own additions taken out.
  // Any other change to what a world at rest draws lands here on purpose.
  it("leaves the approved render's shader as it was, but for the lights' one gated line", () => {
    const approved = SURFACE_FRAGMENT.replace(`${LIGHT_UNIFORMS}\n`, "")
      .replace(`${LIGHTS}\n`, "")
      .replace(/ {2}if \(settled > 0\.0\).*\n/u, "")
      .replace("* CITY_LIGHT *", "* vec3(1.0, 0.8, 0.52) *");
    expect(createHash("sha256").update(new TextEncoder().encode(approved)).digest("hex")).toBe(APPROVED_SURFACE);
  });

  it("reads no light unless a world has some: `settled` is a uniform, so at rest not one of its reads runs", () => {
    expect(SURFACE_FRAGMENT).toContain("if (settled > 0.0)");
    expect(SURFACE_FRAGMENT.lastIndexOf("settlements(")).toBeGreaterThan(
      SURFACE_FRAGMENT.indexOf("if (settled > 0.0)"),
    );
  });

  it("takes a derivative nowhere past the branch that skips a day pixel, which varies by pixel", () => {
    const [, past = ""] = LIGHTS.split("if (night <= 0.0)");
    for (const word of ["dFdx", "dFdy", "fwidth", "lookupOf", "lines("]) expect(past, word).not.toContain(word);
  });
});
