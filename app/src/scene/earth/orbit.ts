// The Earth's golden ring, which is the Moon's orbit: a tilted line that passes behind the globe, never the flat ring (the decision of
// 2026-10-31). It carries no state: nothing reports one for the Earth, and the video's "usual hour" has no source (ADR-0002, status ring).
import {
  AdditiveBlending,
  Group,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  TorusGeometry,
  Vector3,
  type Object3D,
} from "three";
import { GLOW_FRAGMENT, GLOW_VERTEX, ORBIT_FRAGMENT, ORBIT_VERTEX } from "./orbitShader.ts";

/** In Earth radii. */
export const ORBIT_RADIUS = 1.143;
/** Where the Moon rests, on the front of the orbit, near the top. */
export const MOON_REST = 1.67;

const TUBE = 0.085;
const TUBE_SIDES = 16;
const SEGMENTS = 360;
/** The orbit's lean, the Earth's and a world's status ring's alike. */
export const ORBIT_TILT = -1.24;
export const ORBIT_ROLL = -0.1;
const GLOW_SIDE = 0.62;
// Frame 4's ring, in Earth radii: 1.9 across, 1.1 up, so it leans the arcsine of their ratio.
const FINE_REACH = 1.9;
const FINE_TILT = -0.618;
/** Where a small Earth's Moon rests: out at the ring's left end, as frame 4's. */
export const MOON_FAR = 3.736;
/** Frame 4's Moon, 13 pixels on a 47-pixel Earth: its own size would be two pixels at this distance. */
export const FAR_MOON_RADIUS = 0.27;
// Over the air, which is order 1.
const ORBIT_ORDER = 2;

export interface Orbit {
  readonly group: Group;
  /** The point of the orbit at `angle`, in the globe's space. */
  moonAt(angle: number, into: Vector3): Vector3;
  /** Where the Moon is: the wake follows it. */
  setHead(angle: number): void;
  /** For an Earth among the worlds: frame 4's wide ellipse, `line` in place of the tube, with no halo. */
  setFine(line: Object3D): void;
  dispose(): void;
}

/** A material of added light, the orbit's and a world's ring's and glows alike. */
export const added = (vertexShader: string, fragmentShader: string, uniforms: ShaderMaterial["uniforms"]) =>
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
    this.group.rotation.set(ORBIT_TILT, 0, ORBIT_ROLL, "ZXY");
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
    const reach = ORBIT_RADIUS * this.group.scale.x;
    return into.set(reach * Math.cos(angle), 0, reach * Math.sin(angle)).applyEuler(this.group.rotation);
  }

  setHead(angle: number): void {
    const head = this.#line.material.uniforms["head"];
    if (head !== undefined) head.value = angle;
  }

  setFine(line: Object3D): void {
    this.group.scale.setScalar(FINE_REACH / ORBIT_RADIUS);
    this.group.rotation.x = FINE_TILT;
    this.#glow.visible = false;
    this.#line.visible = false;
    this.group.add(line);
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
