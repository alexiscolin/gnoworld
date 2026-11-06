import { ANCHORS, asciiBytes, planetLook, planetRecipe, type Anchor } from "@gnoworld/core";
import {
  Color,
  Euler,
  Matrix3,
  Matrix4,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { EARTH, MOON } from "../earth/look.ts";
import { GLOW_FRAGMENT, ORBIT_FRAGMENT } from "../earth/orbitShader.ts";
import { AIR_FRAGMENT } from "./airShader.ts";
import { createWorld } from "./generated.ts";
import { GENERATED_FRAGMENT } from "./generatedShader.ts";
import { createPlanet, type MapSet, type Planet } from "./planet.ts";
import { RING_FRAGMENT } from "./ringShader.ts";
import { HALO_FRAGMENT } from "./signShaders.ts";
import { PARTS, SHADE } from "./surfaceParts.ts";
import { SURFACE_FRAGMENT } from "./surfaceShader.ts";

// A world's parts and its two surface programs: the Earth and its Moon drawn from their real maps as they are (hand-made, ADR-0002 §3),
// every other world generated (generated.test.ts), both under one light.
const DAO = asciiBytes("gno.land/r/gov/dao");
const SURFACES = [SURFACE_FRAGMENT, GENERATED_FRAGMENT];

const fixed = (): MapSet => {
  const shared = new Texture();
  return { map: () => shared, clouds: new Texture(), ring: new Texture() };
};
const sphere = new SphereGeometry(1, 8, 6);
const generated = (anchor: Anchor) =>
  createWorld({ look: planetLook(DAO, anchor), recipe: planetRecipe(DAO, anchor) }, fixed(), sphere);
const meshes = (planet: Planet): Mesh[] =>
  planet.group.children.filter((child): child is Mesh => child instanceof Mesh);
const read = (material: ShaderMaterial, name: string): unknown => material.uniforms[name]?.value;
const linear = ([red, green, blue]: readonly [number, number, number]) =>
  new Color().setRGB(red, green, blue, SRGBColorSpace);
// An edge's value with every name at a half, for edges written as sums: `low - 0.1`, `1.0 - caps + 0.05`, `1.0 + scale * 2.0`.
const edge = (text: string): number =>
  [...text.replaceAll(/[a-zA-Z][\w.]*/g, "0.5").matchAll(/([-+]?)\s*([\d.]+)(?:\s*\*\s*([\d.]+))?/g)].reduce(
    (sum, [, sign, value = "0", times = "1"]) => sum + (sign === "-" ? -1 : 1) * Number(value) * Number(times),
    0,
  );

describe("the Earth and its Moon, hand-made", () => {
  it("are drawn by the program of real maps, which holds nothing a generated world reads", () => {
    for (const look of [EARTH, MOON]) {
      const { surface } = createPlanet(look, fixed(), sphere);
      expect(surface.fragmentShader).toBe(SURFACE_FRAGMENT);
      for (const name of ["shape", "low", "minorMap", "banded", "settled"])
        expect(surface.uniforms).not.toHaveProperty(name);
    }
    expect(SURFACE_FRAGMENT).not.toMatch(/\bshape\b|\bminorMap\b/);
  });

  it("hands the Earth its clouds and its night, the Moon its relief and none", () => {
    const night = new Texture();
    const earth = createPlanet(EARTH, { ...fixed(), night }, sphere).surface;
    expect(read(earth, "cloudCover")).toBe(EARTH.clouds);
    expect(read(earth, "nightLights")).toBe(1);
    expect(read(earth, "nightMap")).toBe(night);
    const moon = createPlanet(MOON, fixed(), sphere).surface;
    expect(read(moon, "relief")).toBe(MOON.relief);
    expect(read(moon, "cloudCover")).toBe(0);
    expect(read(moon, "nightLights")).toBe(0);
    expect(read(earth, "air")).toBe(1);
    expect(read(moon, "air")).toBe(0);
  });

  it("reads the Earth's sea where its own map is bluest", () => {
    expect(SURFACE_FRAGMENT).toContain("smoothstep(0.004, 0.02, base.b - max(base.r, base.g))");
  });

  it("switches the Earth's city lights on across the arc the day goes out in, and dims them under its clouds", () => {
    expect(SURFACE_FRAGMENT).toContain("float dusk = 1.0 - smoothstep(-0.16, 0.4, day);");
    expect(SURFACE_FRAGMENT).toMatch(/colour \+= [^;]*dusk[^;]*overcast/);
  });

  it("shades relief a pixel away, never a texel, and soft-clips its slope", () => {
    expect(SURFACE_FRAGMENT).toContain("length(fwidth(axis))");
    expect(SURFACE_FRAGMENT).toMatch(/slope \/= 1\.0 \+/);
  });

  it("draws the Earth's halo at full strength, in its air lifted 45% towards white", () => {
    const { surface } = createPlanet(EARTH, fixed(), sphere);
    expect(read(surface, "hazeAmount")).toBeCloseTo(0.9, 10);
    const { r, g, b } = read(surface, "hazeColour") as Color;
    const wanted = linear([0.56, 0.626, 0.747]);
    expect([r, g, b].map((channel) => channel.toFixed(10))).toEqual(
      [wanted.r, wanted.g, wanted.b].map((channel) => channel.toFixed(10)),
    );
  });

  it.each([
    { thickness: 0.05, amount: 0.9 },
    { thickness: 0.08, amount: 0.9 },
    { thickness: 0.03, amount: 0.54 },
    { thickness: 0.01, amount: 0.315 },
  ])("draws a halo of $amount on an air $thickness thick, thinning to a floor", ({ thickness, amount }) => {
    const look = { ...EARTH, rim: { colour: [0.2, 0.32, 0.54] as const, thickness } };
    expect(read(createPlanet(look, fixed(), sphere).surface, "hazeAmount")).toBeCloseTo(amount, 10);
  });

  it("frees what it made and leaves what it shares, once", () => {
    const set = fixed();
    const planet = createPlanet(EARTH, set, sphere);
    const owned = meshes(planet).map((part) => vi.spyOn(part.material as ShaderMaterial, "dispose"));
    const shared = [set.clouds, set.ring, set.map("moon")].map((texture) => vi.spyOn(texture, "dispose"));
    const geometry = vi.spyOn(sphere, "dispose");
    planet.dispose();
    planet.dispose();
    for (const dispose of owned) expect(dispose).toHaveBeenCalledOnce();
    for (const dispose of [geometry, ...shared]) expect(dispose).not.toHaveBeenCalled();
  });
});

describe("a world's parts, on either program", () => {
  it("marks the air of the worlds that have it, so the halo and the blue night follow it", () => {
    const airless = ["rocky", "ice", "dark carbon", "shattered", "nitrogen ice", "grooved ice", "two-faced"];
    for (const anchor of ANCHORS)
      expect(read(generated(anchor).surface, "air"), anchor).toBe(airless.includes(anchor) ? 0 : 1);
  });

  it("tints the halo of a world's air with the air's own colour, lifted, and gives an airless world none", () => {
    const look = planetLook(DAO, "temperate");
    if (look.rim === null) throw new Error("a temperate world has air");
    const halo = read(generated("temperate").surface, "hazeColour") as Color;
    expect(halo.b).toBeGreaterThan(linear(look.rim.colour).b);
    expect(halo.b).toBeLessThan(1);
    expect(halo.b / halo.r).toBeGreaterThan(1);
    expect(read(generated("rocky").surface, "hazeAmount")).toBe(0);
  });

  it("draws a thinner halo for a thinner air, never none", () => {
    const [thick, thin] = ["temperate", "volcanic"].map(
      (anchor) => read(generated(anchor as Anchor).surface, "hazeAmount") as number,
    );
    expect(thin).toBeGreaterThan(0);
    expect(thin).toBeLessThan(thick ?? 0);
  });

  it("casts no ring's shadow on a world with no rings", () => {
    expect(read(generated("rocky").surface, "ringOuter")).toBe(0);
  });

  it("leaves the edge of a world's air to its scattering, unless it is asked to light it", () => {
    const planet = generated("temperate");
    const air = meshes(planet)[1]?.material as ShaderMaterial;
    expect(air.uniforms["limbLight"]?.value).toBe(0);
    planet.setLimb(0.7);
    expect(air.uniforms["limbLight"]?.value).toBe(0.7);
  });

  it("tilts a world's axis and turns its ground by the look's angles", () => {
    const look = planetLook(DAO, "rocky");
    const planet = generated("rocky");
    expect(planet.group.rotation.z).toBe(look.tilt);
    expect(planet.group.rotation.x).toBe(look.lean);
    const wanted = new Matrix3().setFromMatrix4(
      new Matrix4().makeRotationFromEuler(new Euler(look.spin[1], look.spin[0], look.spin[2], "YXZ")),
    );
    expect(read(planet.surface, "spin")).toEqual(wanted);
  });

  // 7d6, Alexis's depth: a far world softer and a little dimmer, as frame 4's, its light the approved one; up close, nothing changes.
  it("starts every part of a world crisp, and dims and softens it all by how far it stands", () => {
    for (const planet of [generated("gas giant"), createPlanet(EARTH, fixed(), sphere)]) {
      const parts = meshes(planet).map((part) => part.material as ShaderMaterial);
      expect(parts.length).toBeGreaterThan(1);
      for (const part of parts) expect(read(part, "faraway")).toBe(0);
      planet.setFar(0.3);
      for (const part of parts) expect(read(part, "faraway")).toBe(0.3);
    }
  });

  it("dims a far world toward its own grey and darker, after its light, so the Earth's page at 0 draws as approved", () => {
    for (const fragment of [...SURFACES, AIR_FRAGMENT, RING_FRAGMENT]) {
      expect(fragment).toMatch(/uniform float faraway;/);
      // The last thing done to the colour before the grade: a share of grey and a share of dark, each a product of `faraway`.
      const [, last = ""] = /\n([^\n]*faraway[^\n]*)\n\s*#include <tonemapping_fragment>/.exec(fragment) ?? [];
      expect(last).toMatch(
        /gl_FragColor\.rgb\s*=\s*mix\(gl_FragColor\.rgb,\s*vec3\(dot\(gl_FragColor\.rgb, [^)]*\)+,\s*[\d.]+ \* faraway\) \* \(1\.0 - [\d.]+ \* faraway\);/,
      );
    }
  });

  it("gives every part of a world the one sun, as a copy", () => {
    const planet = generated("temperate");
    const sun = new Vector3(1, 0, 0);
    planet.setSun(sun);
    for (const part of meshes(planet)) {
      const value = read(part.material as ShaderMaterial, "sun") as Vector3;
      expect(value.equals(sun)).toBe(true);
      expect(value).not.toBe(sun);
    }
  });
});

describe("the surface programs", () => {
  // Inside a branch that varies by pixel a GPU cannot take its own derivatives: an implicit level is undefined there, which a software
  // renderer never shows.
  it("read the ring's shadow at a level they name", () => {
    expect(PARTS).toContain("textureLod(ringMap,");
    for (const shader of SURFACES) expect(shader).not.toContain("texture2D(ringMap,");
  });

  // The grain on a real GPU: east and across differ by a whole number but fract() rounds each its own way, so choosing between them by
  // comparing their fwidth() flipped from pixel to pixel, a quad read a whole map apart, and the choice moved with the turn: a shimmer.
  it("never pick the map's seam by comparing derivatives, and take each candidate longitude's own", () => {
    for (const shader of SURFACES) {
      expect(shader).not.toMatch(/fwidth\(east\)\s*<=?\s*fwidth\(across\)/);
      expect(shader).not.toMatch(/dFdx\(uv\)|dFdy\(uv\)/);
      for (const name of ["east", "across"])
        for (const axis of ["dFdx", "dFdy"]) expect(shader).toContain(`${axis}(${name})`);
    }
  });

  it("keep a rift at least a pixel wide, and skip it where no rift reaches", () => {
    expect(GENERATED_FRAGMENT).toContain("smoothstep(0.0, max(width, pixel), away)");
    expect(GENERATED_FRAGMENT).toMatch(/if \(riven > 0\.0\) rift = lines\([^;]*pixel\)/);
  });

  it("never ask a smoothstep with its edges reversed, which GLSL leaves undefined and a software GPU hides", () => {
    for (const shader of [...SURFACES, AIR_FRAGMENT, RING_FRAGMENT, ORBIT_FRAGMENT, GLOW_FRAGMENT, HALO_FRAGMENT])
      for (const [call = "", low = "0", high = "0"] of shader.matchAll(/smoothstep\(([^,()]+), ([^,()]+),/g))
        expect(edge(low), call).toBeLessThan(edge(high));
  });

  it("take every fragment through the one grade, the tone first, then the screen's colours (ADR-0002 §10)", () => {
    for (const shader of [...SURFACES, AIR_FRAGMENT, RING_FRAGMENT, ORBIT_FRAGMENT, GLOW_FRAGMENT, HALO_FRAGMENT]) {
      const tone = shader.indexOf("#include <tonemapping_fragment>");
      expect(tone).toBeGreaterThan(0);
      expect(shader.indexOf("#include <colorspace_fragment>")).toBeGreaterThan(tone);
    }
  });

  it("hold what a night keeps at the values the eclipse's ceiling and the Earth's sea were tuned to", () => {
    expect(PARTS).toContain("const float NIGHT = 0.007;");
    expect(PARTS).toContain("const float NIGHT_GLOW = 0.07;");
    expect(PARTS).toContain("const vec3 DEEP_BLUE = vec3(0.12, 0.22, 0.5);");
    expect(PARTS).toContain("const vec3 SEA_FLOOR = vec3(0.017, 0.032, 0.095);");
    expect(PARTS).toContain("const float SOFT_AIR = 1.0;");
  });

  it("leave a generated world's air as 7b drew it: the softer terminator waits behind the Earth's limb", () => {
    expect(AIR_FRAGMENT).toContain(
      "float lit = smoothstep(1.0 - scale * 0.2, 1.0 + scale * 2.0, dot(at, sun) < 0.0 ? across : 2.0);",
    );
    expect(AIR_FRAGMENT).toMatch(/if \(limbLight > 0\.0\) lit = /);
  });

  it("give every world with air a night that is blue, not dead, and the Earth its own from its night map", () => {
    expect(SHADE).toContain("mix(hazeColour * 0.35, DEEP_BLUE, 0.65) * (0.35 + dot(albedo, LUMA)) * NIGHT_GLOW");
    expect(GENERATED_FRAGMENT).toContain("if (air > 0.5) colour = nightAir(colour, albedo, light);");
    expect(SURFACE_FRAGMENT).not.toContain("nightAir(colour");
  });

  it("dim a ring in its world's shadow and never cut it, the hole at a ring's lower right having been a bug", () => {
    expect(RING_FRAGMENT).toContain("const float SHADED = 0.3;");
    expect(RING_FRAGMENT).toContain("float lit = mix(SHADED, 1.0, smoothstep(0.9, 1.1, past));");
  });
});
