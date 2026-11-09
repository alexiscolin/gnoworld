// The demo's lights (D401), each one draw: the suns, every system's dust, the far stars. Grains are placed by a hash of their index:
// the same sky each visit, no chance drawn.
import {
  BufferGeometry,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  Mesh,
  Points,
  ShaderMaterial,
  type IUniform,
} from "three";
import { hashOf } from "../hash.ts";
import type { Universe } from "../layout.ts";
import { DUST_VERTEX, POINT_FRAGMENT, STARS_VERTEX, SUNS_FRAGMENT, SUNS_VERTEX } from "../shaders/glows.ts";
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
  readonly mesh: Mesh;
  /** Lights the systems `lit` says by their index (none: every one). */
  light(lit: ((index: number) => boolean) | undefined): void;
}

/** The suns, one quad each. */
export function sunsOf({ systems }: Universe, uniforms: Uniforms): Suns {
  const geometry = quads(systems.length);
  const at = systems.flatMap(({ place }) => [place.x, place.y, place.z]);
  geometry.setAttribute("aPlace", new InstancedBufferAttribute(new Float32Array(at), 3));
  const sun = systems.flatMap(({ sun: colour, core }) => [...colour, core]);
  geometry.setAttribute("aSun", new InstancedBufferAttribute(new Float32Array(sun), 4));
  const lit = new InstancedBufferAttribute(new Float32Array(systems.length).fill(1), 1);
  geometry.setAttribute("aLit", lit);
  const mesh = new Mesh(geometry, additive(uniforms, SUNS_VERTEX, SUNS_FRAGMENT));
  mesh.frustumCulled = false;
  return {
    mesh,
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
export function dustOf({ systems }: Universe, uniforms: Uniforms): Points {
  const [positions, colours]: [number[], number[]] = [[], []];
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
      const k = 0.2 + hashOf(key, 6) * 0.25;
      colours.push(sun[0] * k, sun[1] * k, sun[2] * k, 0.18 + hashOf(key, 7) * 0.3);
    }
  }
  return points(positions, colours, additive(uniforms, DUST_VERTEX, POINT_FRAGMENT));
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
