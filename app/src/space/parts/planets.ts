// Every planet of the universe in one draw (D401): a quad each, on its orbit by the GPU's clock, in its generated look's colours. A
// planet drawn as itself (near.ts) is hidden here, by its `aShown`, written only when that set changes.
import { worldRecipe } from "@gnoworld/core";
import {
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  Vector3,
  type IUniform,
} from "three";
import { DISC, type Universe } from "../layout.ts";
import { HEART } from "../saucer.ts";
import { boosts } from "../boosts.ts";
import { PLANETS_FRAGMENT, PLANETS_VERTEX } from "../shaders/planets.ts";

const QUAD = [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0];
// The Earth's look is hand-made: blue and green, kind 2.
const EARTH_LOW = [0.03, 0.09, 0.2] as const;
const EARTH_HIGH = [0.12, 0.2, 0.08] as const;

/** A quad per instance, `count` of them. */
export function quads(count: number): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(QUAD, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.instanceCount = count;
  return geometry;
}

// Attribute `name` of `geometry`, an instance's `size` numbers each.
const each = (geometry: InstancedBufferGeometry, name: string, { values, size }: { values: number[]; size: number }) =>
  geometry.setAttribute(name, new InstancedBufferAttribute(new Float32Array(values), size));

/** Marks each instance of `attribute` lit or not, as `lit` says by its index (none: every one lit), the rest dimmed by the frame's lens. */
export function lightEach(attribute: InstancedBufferAttribute, lit: ((index: number) => boolean) | undefined): void {
  for (let index = 0; index < attribute.count; index += 1)
    attribute.setX(index, lit === undefined || lit(index) ? 1 : 0);
  attribute.needsUpdate = true;
}

export class Planets {
  readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  readonly #shown: InstancedBufferAttribute;
  readonly #lit: InstancedBufferAttribute;

  /** The planets of `universe`, sharing the frame's `uniforms`. */
  constructor(universe: Universe, uniforms: Record<string, IUniform>) {
    const geometry = quads(universe.planets.length);
    const { planets } = universe;
    const vec = (pick: (planet: (typeof planets)[number]) => { x: number; y: number; z: number }) =>
      planets.flatMap((planet) => {
        const { x, y, z } = pick(planet);
        return [x, y, z];
      });
    each(geometry, "aCentre", { values: vec((p) => p.system.place), size: 3 });
    each(geometry, "aAcross", { values: vec((p) => p.system.across), size: 3 });
    each(geometry, "aAlong", { values: vec((p) => p.system.along), size: 3 });
    each(geometry, "aOrbit", { values: planets.flatMap((p) => [p.orbit, p.phase, p.speed, p.radius]), size: 4 });
    // A banded world is drawn banded far out, as its generated surface is: kind 0; a rocky one, kind 1; the Earth, 2.
    const recipes = planets.map((p) => (p === universe.earth ? undefined : worldRecipe(p.id, null)));
    const kindOf = (recipe: (typeof recipes)[number]) => (recipe === undefined ? 2 : recipe.surface.bands > 0 ? 0 : 1);
    const low = recipes.flatMap((r, at) => [...(r?.palette.linear[0] ?? EARTH_LOW), (at * 0.618) % 1]);
    each(geometry, "aLow", { values: low, size: 4 });
    each(geometry, "aHigh", {
      values: recipes.flatMap((r) => [...(r?.palette.linear[2] ?? EARTH_HIGH), kindOf(r)]),
      size: 4,
    });
    this.#shown = new InstancedBufferAttribute(new Float32Array(planets.length).fill(1), 1);
    geometry.setAttribute("aShown", this.#shown);
    this.#lit = new InstancedBufferAttribute(new Float32Array(planets.length).fill(1), 1);
    geometry.setAttribute("aLit", this.#lit);
    each(geometry, "aReach", { values: planets.map((p) => p.system.reach), size: 1 });
    const material = new ShaderMaterial({
      uniforms: {
        ...uniforms,
        uDisc: { value: DISC * universe.scale },
        uHeart: { value: new Vector3(HEART.x, HEART.y, HEART.z) },
        uFeat: boosts,
      },
      vertexShader: PLANETS_VERTEX,
      fragmentShader: PLANETS_FRAGMENT,
      alphaToCoverage: true,
    });
    this.mesh = new Mesh(geometry, material);
    this.mesh.frustumCulled = false;
  }

  /** Lights the planets `lit` says by their index (none: every one), the rest dimmed as the frame's lens comes (D425). */
  light(lit: ((index: number) => boolean) | undefined): void {
    lightEach(this.#lit, lit);
  }

  /** Shows planet `index` here, or hides it while it is drawn as itself. */
  show(index: number, shown: boolean): void {
    const value = shown ? 1 : 0;
    if (this.#shown.getX(index) === value) return;
    this.#shown.setX(index, value);
    this.#shown.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
