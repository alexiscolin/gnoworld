// The Earth's golden ring, which is the Moon's orbit: a tilted line that passes behind the globe, never the flat ring (the decision of
// 2026-10-31). It carries no state: nothing reports one for the Earth, and the video's "usual hour" has no source (ADR-0002, status ring).
import { AdditiveBlending, Group, Mesh, PlaneGeometry, ShaderMaterial, TorusGeometry, Vector3 } from "three";
import { GLOW_FRAGMENT, GLOW_VERTEX, ORBIT_FRAGMENT, ORBIT_VERTEX } from "./orbitShader.ts";

/** In Earth radii. */
export const ORBIT_RADIUS = 1.143;
/** Where the Moon rests, on the front of the orbit, near the top. */
export const MOON_REST = 1.67;

const TUBE = 0.085;
const TUBE_SIDES = 16;
const SEGMENTS = 360;
const TILT = -1.24;
const ROLL = -0.1;
const GLOW_SIDE = 0.62;
// Over the air, which is order 1.
const ORBIT_ORDER = 2;

export interface Orbit {
  readonly group: Group;
  /** The point of the orbit at `angle`, in the globe's space. */
  moonAt(angle: number, into: Vector3): Vector3;
  /** Where the Moon is: the wake follows it. */
  setHead(angle: number): void;
  /** Keeps the line alone, for an Earth a few dozen pixels wide: frame 4's thin ring. */
  setFine(): void;
  dispose(): void;
}

const added = (vertexShader: string, fragmentShader: string, uniforms: ShaderMaterial["uniforms"]) =>
  new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });

class LiveOrbit implements Orbit {
  readonly group = new Group();
  readonly #line: Mesh<TorusGeometry, ShaderMaterial>;
  readonly #glow: Mesh<PlaneGeometry, ShaderMaterial>;

  constructor() {
    this.group.rotation.set(TILT, 0, ROLL, "ZXY");
    const tube = new TorusGeometry(ORBIT_RADIUS, TUBE, TUBE_SIDES, SEGMENTS).rotateX(Math.PI / 2);
    this.#line = new Mesh(tube, added(ORBIT_VERTEX, ORBIT_FRAGMENT, { head: { value: 0 } }));
    this.#line.renderOrder = ORBIT_ORDER;
    this.group.add(this.#line);
    this.#glow = new Mesh(new PlaneGeometry(GLOW_SIDE, GLOW_SIDE), added(GLOW_VERTEX, GLOW_FRAGMENT, {}));
    this.#glow.renderOrder = ORBIT_ORDER;
  }

  get glow(): Mesh {
    return this.#glow;
  }

  moonAt(angle: number, into: Vector3): Vector3 {
    return into.set(ORBIT_RADIUS * Math.cos(angle), 0, ORBIT_RADIUS * Math.sin(angle)).applyEuler(this.group.rotation);
  }

  setHead(angle: number): void {
    const head = this.#line.material.uniforms["head"];
    if (head !== undefined) head.value = angle;
  }

  setFine(): void {
    this.#line.material.defines = { FINE: "" };
    this.#line.material.needsUpdate = true;
  }

  dispose(): void {
    for (const mesh of [this.#line, this.#glow]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}

/** The ring, with no Moon of its own: the caller owns that. */
export const createOrbit = (): Orbit & { readonly glow: Mesh } => new LiveOrbit();
