// The demo's lights (D401), each one draw: the suns, every system's dust, the far stars. Grains are placed by a hash of their index:
// the same sky each visit, no chance drawn.
import {
  BufferGeometry,
  CustomBlending,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  Points,
  ShaderMaterial,
  SrcAlphaFactor,
  ZeroFactor,
  type IUniform,
} from "three";
import { hashOf } from "../hash.ts";
import type { Universe } from "../layout.ts";
import {
  DUST_VERTEX,
  POINT_FRAGMENT,
  STARS_VERTEX,
  SUN_DISC_FRAGMENT,
  SUNS_FRAGMENT,
  SUNS_VERTEX,
} from "../shaders/glows.ts";
import { lightEach, quads } from "./planets.ts";
import { ADDITIVE } from "../additive.ts";

type Uniforms = Record<string, IUniform>;
const STARS = 4000;

/** A light's material: added to what is under it, writing no depth. */
export const additive = (uniforms: Uniforms, vertexShader: string, fragmentShader: string) =>
  new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    ...ADDITIVE,
  });

/** The suns and whether a lens lights each one's system. */
export interface Suns {
  /** The glow, added. */
  readonly mesh: Mesh;
  /** The opaque disc, drawn just before the glow. */
  readonly disc: Mesh;
  /** Lights the systems `lit` says by their index (none: every one). */
  light(lit: ((index: number) => boolean) | undefined): void;
}

/** The suns, one quad each. */
export function sunsOf(
  { systems }: Universe,
  frame: Uniforms,
  { delays, still }: { delays: readonly number[]; still: () => boolean },
): Suns {
  // The faces' life, 0 under reduced motion: set as the mesh is drawn, so a frame that is not drawn costs nothing.
  const life = { value: 1 };
  const uniforms = { ...frame, uLife: life };
  const geometry = quads(systems.length);
  const at = systems.flatMap(({ place }) => [place.x, place.y, place.z]);
  geometry.setAttribute("aPlace", new InstancedBufferAttribute(new Float32Array(at), 3));
  const sun = systems.flatMap(({ sun: colour, core }) => [...colour, core]);
  geometry.setAttribute("aSun", new InstancedBufferAttribute(new Float32Array(sun), 4));
  geometry.setAttribute(
    "aDelay",
    new InstancedBufferAttribute(
      Float32Array.from(systems, (_, at) => delays[at] ?? 0),
      1,
    ),
  );
  const lit = new InstancedBufferAttribute(new Float32Array(systems.length).fill(1), 1);
  geometry.setAttribute("aLit", lit);
  // The disc is made, so sorted, before the glow: an opaque face over what is behind (normal blending, the canvas's alpha left alone,
  // as additive.ts), then the glow added round it.
  const disc = new Mesh(
    geometry,
    new ShaderMaterial({
      uniforms,
      vertexShader: SUNS_VERTEX,
      fragmentShader: SUN_DISC_FRAGMENT,
      transparent: true,
      // The disc is solid: it writes depth, so a planet behind it, or its glow drawn later, fails the test; a nearer one passes.
      depthWrite: true,
      blending: CustomBlending,
      blendSrc: SrcAlphaFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendSrcAlpha: ZeroFactor,
      blendDstAlpha: OneFactor,
    }),
  );
  disc.frustumCulled = false;
  // First of the added lights, after the stars (-10): what is drawn after it is tested against its depth.
  disc.renderOrder = -5;
  const mesh = new Mesh(geometry, additive(uniforms, SUNS_VERTEX, SUNS_FRAGMENT));
  mesh.frustumCulled = false;
  mesh.onBeforeRender = () => {
    life.value = still() ? 0 : 1;
  };
  return {
    mesh,
    disc,
    light: (lights) => {
      lightEach(lit, lights);
    },
  };
}

const points = (positions: number[], colours: number[], material: ShaderMaterial): Points => {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aColour", new Float32BufferAttribute(colours, 4));
  const made = new Points(geometry, material);
  made.frustumCulled = false;
  return made;
};

/** Each system's dust, in its plane, tinted by its sun. */
export function dustOf({ systems }: Universe, uniforms: Uniforms, delays: readonly number[]): Points {
  const [positions, colours, late]: [number[], number[], number[]] = [[], [], []];
  for (const system of systems) {
    const { place, across, along, normal, reach, sun } = system;
    for (let at = 0; at < 90 + system.planets.length * 14; at += 1) {
      const key = `${system.id}:${String(at)}`;
      const [a, r] = [hashOf(key, 1) * Math.PI * 2, reach * (0.25 + hashOf(key, 2) ** 0.7 * 1.5)];
      const lift = (hashOf(key, 3) + hashOf(key, 4) + hashOf(key, 5) - 1.5) * reach * 0.12;
      for (const axis of ["x", "y", "z"] as const)
        positions.push(
          place[axis] + (across[axis] * Math.cos(a) + along[axis] * Math.sin(a)) * r + normal[axis] * lift,
        );
      late.push(delays[system.index] ?? 0);
      const k = 0.2 + hashOf(key, 6) * 0.25;
      colours.push(sun[0] * k, sun[1] * k, sun[2] * k, 0.18 + hashOf(key, 7) * 0.3);
    }
  }
  const dust = points(positions, colours, additive(uniforms, DUST_VERTEX, POINT_FRAGMENT));
  dust.geometry.setAttribute("aDelay", new Float32BufferAttribute(late, 1));
  return dust;
}

/** The far stars, a shell round the eye. */
export function starsOf(uniforms: Uniforms): Points {
  const [positions, colours]: [number[], number[]] = [[], []];
  for (let at = 0; at < STARS; at += 1) {
    const [u, v] = [hashOf(String(at), 21) * 2 - 1, hashOf(String(at), 22) * Math.PI * 2];
    const ring = Math.sqrt(1 - u * u);
    positions.push(ring * Math.cos(v), u, ring * Math.sin(v));
    const bright = hashOf(String(at), 23) ** 3;
    const k = 0.25 + 0.75 * bright;
    colours.push(0.8 * k, 0.84 * k, k, bright);
  }
  const stars = points(positions, colours, additive(uniforms, STARS_VERTEX, POINT_FRAGMENT));
  stars.renderOrder = -10;
  return stars;
}
