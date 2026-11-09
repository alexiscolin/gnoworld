// The galaxy's body (Alexis, 2026-11-09, the artifact's look, finer), over the clean dark sky: one instanced draw of glows, each sun's
// sized by its worlds and the heart's soft gold, and one draw of a fine dense field of grains (haze.ts). It belongs to the galaxy's view,
// gone within the disc, and is drawn after the frame, never through the speed's pass, which grades the frame anew and would flash it.
// Nothing of it moves on its own; it reads the stage's uniforms. Low draws a quarter of the grains.
import {
  BufferGeometry,
  InstancedBufferAttribute,
  Mesh,
  Points,
  Scene,
  Vector3,
  type Camera,
  type InstancedBufferGeometry,
  type ShaderMaterial,
  type WebGLRenderer,
} from "three";
import { DISC, type Universe } from "../layout.ts";
import { HEART } from "../saucer.ts";
import { GLOWS_FRAGMENT, GLOWS_VERTEX, GRAINS_FRAGMENT, GRAINS_VERTEX } from "../shaders/sky.ts";
import { GOLD, GRAINS, grainsOf } from "./haze.ts";
import { additive } from "./lights.ts";
import { quads } from "./planets.ts";

// raw: a sun's glow radius is the reference's 2.2 + 2.6 log2(1 + worlds) px times the world units a pixel spans from the galaxy's view;
// its light at its middle
const SUN = { px: 13.8, light: 0.85 } as const;
// raw: a grain's width, a share of the disc's radius before its own size, and its light at its middle before its own share
const GRAIN = { size: 0.012, light: 1.3 } as const;
// raw: the heart's glow, as the reference's radial light at the disc's middle: its radius, a share of the disc's, and its light
const HEART_GLOW = { size: 0.45, light: 0.22 } as const;

/** The uniforms the sky reads from the stage: the suns' gain, the dust's, a lens's light; the frame's pixels a unit at a unit's
 * distance, and the world units a pixel at that distance. */
export interface SkyGains {
  readonly sun: { value: number };
  readonly dust: { value: number };
  readonly lens: { value: number };
  readonly proj: { value: number };
  readonly pxK: { value: number };
}

// Each sun's glow, its `w` its system's reach (the glow goes as it nears), its tint and its radius by its worlds; then the heart's.
function glowsOf(universe: Universe): InstancedBufferGeometry {
  const [places, glows]: [number[], number[]] = [
    [HEART.x, HEART.y, HEART.z, 0],
    [...GOLD.map((channel) => channel * HEART_GLOW.light), HEART_GLOW.size * DISC * universe.scale],
  ];
  for (const { place, reach, sun, planets } of universe.systems) {
    places.push(place.x, place.y, place.z, reach);
    const radius = (2.2 + 2.6 * Math.log2(1 + planets.length)) * SUN.px * universe.scale;
    glows.push(...sun.map((channel) => channel * SUN.light), radius);
  }
  const geometry = quads(places.length / 4);
  geometry.setAttribute("aPlace", new InstancedBufferAttribute(new Float32Array(places), 4));
  geometry.setAttribute("aGlow", new InstancedBufferAttribute(new Float32Array(glows), 4));
  geometry.setAttribute("aSun", new InstancedBufferAttribute(new Float32Array(geometry.instanceCount).fill(1, 1), 1));
  return geometry;
}

const low = (): boolean => document.documentElement.dataset["quality"] === "low";

export class Sky {
  readonly #scene = new Scene();
  readonly #heart = new Vector3(HEART.x, HEART.y, HEART.z);
  readonly #glows: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  readonly #grains: Points<BufferGeometry, ShaderMaterial>;
  readonly #disc = { value: DISC };
  // Low's quarter of the grains, each twice as bright: thinner, half their light kept.
  readonly #thin = { value: 1 };
  readonly #watch = new MutationObserver(() => {
    this.#show();
  });

  constructor({ sun, dust, lens, proj, pxK }: SkyGains) {
    const galaxy = { uLens: lens, uDisc: this.#disc, uHeart: { value: this.#heart } };
    this.#glows = new Mesh(quads(0), additive({ ...galaxy, uGain: sun, uPxK: pxK }, GLOWS_VERTEX, GLOWS_FRAGMENT));
    const grains = {
      uGain: dust,
      uProj: proj,
      uThin: this.#thin,
      uLight: { value: GRAIN.light },
      uSize: { value: GRAIN.size },
    };
    this.#grains = new Points(new BufferGeometry(), additive({ ...galaxy, ...grains }, GRAINS_VERTEX, GRAINS_FRAGMENT));
    // Light through the disc, never cut by a far planet.
    for (const drawn of [this.#glows, this.#grains]) {
      drawn.material.depthTest = false;
      drawn.frustumCulled = false;
    }
    this.#scene.add(this.#grains, this.#glows);
    this.#watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-quality"] });
  }

  /** The body of `universe`, built anew: its glows and its grains. */
  stand(universe: Universe): void {
    this.#glows.geometry.dispose();
    this.#glows.geometry = glowsOf(universe);
    this.#grains.geometry.dispose();
    this.#grains.geometry = grainsOf(universe);
    this.#disc.value = DISC * universe.scale;
    this.#show();
  }

  /** Draws the body over the frame just drawn; nothing, not even a call, once the eye is within the disc, where it is gone. */
  draw(renderer: WebGLRenderer, camera: Camera): void {
    if (camera.position.distanceTo(this.#heart) <= this.#disc.value) return;
    renderer.autoClear = false;
    renderer.render(this.#scene, camera);
    renderer.autoClear = true;
  }

  // Low's share: a quarter of the grains.
  #show(): void {
    const thin = low();
    this.#grains.geometry.setDrawRange(0, thin ? GRAINS / 4 : GRAINS);
    this.#thin.value = thin ? 2 : 1;
  }

  dispose(): void {
    this.#watch.disconnect();
    this.#scene.clear();
    for (const drawn of [this.#glows, this.#grains]) {
      drawn.geometry.dispose();
      drawn.material.dispose();
    }
  }
}
