// The links between worlds, drawn while the Map shows a system, the home or a world (D433): a line from each world to those it is built on
// and those built on it, from the worlds' file's imports (cosmosWorld.ts's usesOf), the planets' ends following their orbits. One
// preallocated, bounded buffer, written each frame; the orbits' colour, their faint strength for a system's own links, a world's brighter.
import { damp } from "@gnoworld/core";
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, LineSegments, ShaderMaterial, Vector3 } from "three";
import { placeOf, type Planet, type System, type Universe, type Vec } from "../layout.ts";
import { LENS_DIM } from "../shaders/planets.ts";
import { ORBIT_COLOUR, ORBIT_GAIN } from "./marks.ts";
import { ADDITIVE } from "../additive.ts";
import { Strip } from "./strip.ts";

// ponytail: a place draws this many links at most; a kit of hundreds of copies importing each other shows its first ones. Raise it
// with the buffer's size if a real system needs more.
const MOST = 2048;
// raw: a world's own links over a system's faint ones, which share the orbits' strength
const BRIGHT = 4 * ORBIT_GAIN;
const FAINT = ORBIT_GAIN;
const EASE_S = 0.3;
const NONE: readonly Link[] = [];

export interface Link {
  readonly from: Planet;
  readonly to: Planet;
}

/** The worlds a hovered `planet` lights: itself and the worlds at the other end of each of its `links`. */
export const litBy = (planet: Planet, links: readonly Link[]): ReadonlySet<string> =>
  new Set([planet.id, ...links.map(({ from, to }) => (from === planet ? to.id : from.id))]);

const VERTEX = /* glsl */ `
attribute float aTone; attribute float aLit; uniform float uLens; varying float vTone;
void main() { vTone = aTone * ${LENS_DIM}; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`;
const FRAGMENT =
  "uniform vec3 uColour; uniform float uGain; varying float vTone; void main() { gl_FragColor = vec4(uColour * uGain * vTone, 1.0); }";
/** What a frame says of the Map's links: the time, the lens (D425), and the screen and the reader's motion settings. */
interface Tick {
  readonly seconds: number;
  readonly lens: ReadonlySet<string> | undefined;
  readonly renderer: { getPixelRatio(): number };
  readonly options: { still(): boolean };
}

// Whether `link` is lit: a pointed planet's own link, or any when none is pointed, and the lens's, which lights both its worlds.
const isLit = ({ from, to }: Link, lens: ReadonlySet<string> | undefined, held: Planet | undefined): boolean =>
  (held === undefined || from === held || to === held) &&
  (lens === undefined || (lens.has(from.id) && lens.has(to.id)));

export class Links {
  readonly gain = { value: 0 };
  readonly lines: LineSegments;
  /** The pointed planet's own links, wide and bright. */
  readonly strip: Strip;
  readonly #uLens: { value: number };
  readonly #material: ShaderMaterial;
  readonly #position = new BufferAttribute(new Float32Array(MOST * 6), 3).setUsage(DynamicDrawUsage);
  readonly #tone = new BufferAttribute(new Float32Array(MOST * 2), 1);
  readonly #lit = new BufferAttribute(new Float32Array(MOST * 2), 1);
  readonly #byPlanet = new Map<Planet, Link[]>();
  readonly #bySystem = new Map<System, Link[]>();
  readonly #at: Vec = { x: 0, y: 0, z: 0 };
  // The links drawn now, whose tone they were written with, and the lens they were lit for.
  #shown = NONE;
  #bright = false;
  #lens: ReadonlySet<string> | undefined;
  // The planet pointed at, and the one the links' dimming is for: kept after the pointer leaves, till the dimming has eased out.
  #pointed: Planet | undefined;
  #held: Planet | undefined;
  #litFor: Planet | undefined;

  constructor({ uLens, uProj }: { uLens: { value: number }; uProj: { value: number } }) {
    this.#uLens = uLens;
    this.strip = new Strip(uProj);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", this.#position);
    geometry.setAttribute("aTone", this.#tone);
    geometry.setAttribute("aLit", this.#lit);
    geometry.setDrawRange(0, 0);
    this.#material = new ShaderMaterial({
      uniforms: { uColour: { value: new Vector3(...ORBIT_COLOUR) }, uGain: this.gain, uLens },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      ...ADDITIVE,
    });
    this.lines = new LineSegments(geometry, this.#material);
    this.lines.frustumCulled = false;
  }

  /** Points at `planet` (none: leaves it): its links show wide and bright, the others dim. Returns the worlds it lights: itself and those it is linked to. */
  point(planet: Planet | undefined): ReadonlySet<string> | undefined {
    this.#pointed = planet;
    return planet === undefined ? undefined : litBy(planet, this.#byPlanet.get(planet) ?? NONE);
  }

  /** The links of `universe`, once per layout: `uses` is each world's id to the worlds it is built on. */
  stand(universe: Universe, uses: ReadonlyMap<string, ReadonlySet<string>>): void {
    this.#byPlanet.clear();
    this.#bySystem.clear();
    this.#shown = NONE;
    const add = <K>(map: Map<K, Link[]>, key: K, link: Link) => {
      const list = map.get(key) ?? [];
      list.push(link);
      map.set(key, list);
    };
    for (const [id, used] of uses)
      for (const other of used) {
        const [from, to] = [universe.byId.get(id), universe.byId.get(other)];
        if (from === undefined || to === undefined) continue;
        const link = { from, to };
        add(this.#byPlanet, from, link);
        add(this.#byPlanet, to, link);
        if (from.system === to.system) add(this.#bySystem, from.system, link);
      }
  }

  /** A frame on: the links of `at` (a world's, or a system's own), none for none. A change of place fades what shows out first. */
  tick(at: Planet | System | undefined, { seconds, lens, renderer, options }: Tick, delta: number): void {
    this.#hover(lens, { seconds, delta, still: options.still(), ratio: renderer.getPixelRatio() });
    const [links, bright] = this.#of(at);
    const same = links === this.#shown && bright === this.#bright;
    if (!same && this.gain.value < 1e-3) this.#set(links, bright, lens);
    const to = same && links !== NONE ? 1 : 0;
    this.gain.value += (to - this.gain.value) * damp(delta / 1000, EASE_S);
    if (this.gain.value < 1e-3) {
      this.gain.value = 0;
      return;
    }
    if (lens !== this.#lens || this.#held !== this.#litFor) this.#light(lens);
    this.#follow(seconds);
  }

  // The pointed planet's strip comes and goes, its other links dimming with the lens's own ease (uLens, move.ts).
  #hover(
    lens: ReadonlySet<string> | undefined,
    frame: { seconds: number; delta: number; still: boolean; ratio: number },
  ): void {
    const pointed = this.#pointed;
    if (pointed !== undefined) this.#held = pointed;
    else if (lens !== undefined || this.#uLens.value < 1e-3) this.#held = undefined;
    this.strip.tick(pointed === undefined ? undefined : (this.#byPlanet.get(pointed) ?? NONE), frame);
  }

  // The links to draw for `at`, and whether they are bright: a world's own, or a system's between its worlds.
  #of(at: Planet | System | undefined): readonly [readonly Link[], boolean] {
    if (at === undefined) return [NONE, false];
    return "system" in at ? [this.#byPlanet.get(at) ?? NONE, true] : [this.#bySystem.get(at) ?? NONE, false];
  }

  // Draws `links` from now on, each with its tone.
  #set(links: readonly Link[], bright: boolean, lens: ReadonlySet<string> | undefined): void {
    this.#shown = links;
    this.#bright = bright;
    const count = Math.min(links.length, MOST);
    this.lines.geometry.setDrawRange(0, count * 2);
    this.#tone.array.fill(bright ? BRIGHT : FAINT, 0, count * 2);
    this.#tone.needsUpdate = true;
    this.#light(lens);
  }

  // A lens (D425) lights the links whose two worlds it lights, a hovered planet those it has; the shader eases the rest's dimming with the lens's own.
  #light(lens: ReadonlySet<string> | undefined): void {
    this.#lens = lens;
    this.#litFor = this.#held;
    const held = this.#held;
    const count = Math.min(this.#shown.length, MOST);
    for (let at = 0; at < count; at += 1) {
      const link = this.#shown[at];
      const lit = link !== undefined && isLit(link, lens, held);
      this.#lit.array[at * 2] = lit ? 1 : 0;
      this.#lit.array[at * 2 + 1] = lit ? 1 : 0;
    }
    this.#lit.needsUpdate = true;
  }

  // The links' ends where their planets stand now.
  #follow(seconds: number): void {
    const [out, at] = [this.#position.array, this.#at];
    const count = Math.min(this.#shown.length, MOST);
    for (let link = 0; link < count; link += 1) {
      const each = this.#shown[link];
      if (each === undefined) continue;
      placeOf(each.from, seconds, at);
      [out[link * 6], out[link * 6 + 1], out[link * 6 + 2]] = [at.x, at.y, at.z];
      placeOf(each.to, seconds, at);
      [out[link * 6 + 3], out[link * 6 + 4], out[link * 6 + 5]] = [at.x, at.y, at.z];
    }
    this.#position.needsUpdate = true;
  }

  dispose(): void {
    this.lines.geometry.dispose();
    this.#material.dispose();
    this.strip.dispose();
  }
}
