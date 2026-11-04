// How the study's cloud is drawn (particles.ts): a soft particle a world, its size and light from where the eye stands and focuses, blurred
// nearer than the focus as a lens does; the chosen cluster in gold, with its rings and a horizontal line of light through its brightest world.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector3,
  type PerspectiveCamera,
} from "three";
import { LINE_FRAGMENT, LINE_VERTEX, POINT_FRAGMENT, POINT_VERTEX } from "./particlesGlsl.ts";
import type { Cluster, Laid } from "./particlesLayout.ts";
import { values } from "./particlesValues.ts";

const GOLD = new Color(1, 0.66, 0.22);
const PEACH = new Color(0.95, 0.6, 0.47);
const ROSE = new Color(0.82, 0.45, 0.5);
const EARTH = new Color(0.4, 0.6, 1.2);
const RING_SHARES = [1, 1.6, 2.3] as const;
const RING_TILT = 0.42;
const RING_SIDES = 160;
const LINE_HALF_PX = 48;

const added = (vertexShader: string, fragmentShader: string, uniforms: Record<string, { value: unknown }>) =>
  new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });

function ringsOf(look: LineBasicMaterial): Group {
  const rings = new Group();
  for (const share of RING_SHARES) {
    const corners = new Float32Array(RING_SIDES * 3);
    for (let side = 0; side < RING_SIDES; side += 1) {
      const angle = (2 * Math.PI * side) / RING_SIDES;
      corners.set([share * Math.cos(angle), share * Math.sin(angle), 0], side * 3);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(corners, 3));
    rings.add(new LineLoop(geometry, look));
  }
  return rings;
}

/** Where a frame draws from: the camera, the screen, the lens, where it focuses, and the cluster chosen. */
export interface Frame {
  readonly camera: PerspectiveCamera;
  readonly width: number;
  readonly height: number;
  readonly focal: number;
  /** From where the mass's light falls with distance, and where it is down to `values.far`. */
  readonly near: number;
  readonly far: number;
  readonly chosen: number;
  readonly target: Cluster | undefined;
}

export class Look {
  readonly group = new Group();
  readonly #uniforms;
  readonly #line = {
    uAt: { value: { x: 0, y: 0 } },
    uHalf: { value: 0.02 },
    uGold: { value: GOLD },
    uLight: { value: 1 },
    uPixels: { value: { x: 1, y: 1 } },
  };
  readonly #ringLook = new LineBasicMaterial({
    color: GOLD,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  readonly #rings = ringsOf(this.#ringLook);
  readonly #points: ShaderMaterial;
  #cloud: Points<BufferGeometry, ShaderMaterial> | undefined;
  #sizes: ArrayLike<number> = [];

  constructor(ratio: number) {
    const one = (value: number) => ({ value });
    this.#uniforms = {
      ...{ uFocal: one(1), uLeast: one(1), uRatio: one(ratio), uChosen: one(0), uNear: one(1), uFarAt: one(2) },
      ...{ uFar: one(1), uLight: one(1), uDustLight: one(1), uDim: one(1), uGoldLift: one(1), uWarm: one(1) },
      ...{ uGold: { value: GOLD }, uPeach: { value: PEACH }, uRose: { value: ROSE }, uEarth: { value: EARTH } },
    };
    this.#points = new ShaderMaterial({
      uniforms: this.#uniforms,
      vertexShader: POINT_VERTEX,
      fragmentShader: POINT_FRAGMENT,
    });
    const line = new Mesh(new PlaneGeometry(2, 2), added(LINE_VERTEX, LINE_FRAGMENT, this.#line));
    line.material.depthTest = false;
    line.frustumCulled = false;
    line.renderOrder = 2;
    this.group.add(this.#rings, line);
  }

  /** Stands `laid`'s particles, the last cloud let go. */
  stand(laid: Laid): void {
    if (this.#cloud !== undefined) {
      this.group.remove(this.#cloud);
      this.#cloud.geometry.dispose();
    }
    const geometry = new BufferGeometry();
    this.#sizes = laid.sizes;
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(laid.positions), 3));
    geometry.setAttribute("aSize", new BufferAttribute(new Float32Array(laid.sizes), 3));
    geometry.setAttribute("aCluster", new BufferAttribute(laid.owners, 1));
    this.#cloud = new Points(geometry, this.#points);
    this.#cloud.frustumCulled = false;
    this.group.add(this.#cloud);
  }

  /** The places on the way to the stood ones, and the new particles `grow` grown to `share` of their size. */
  move(positions: Float32Array, grow: ReadonlySet<number>, share: number): void {
    const geometry = this.#cloud?.geometry;
    const [at, size] = [geometry?.getAttribute("position"), geometry?.getAttribute("aSize")];
    if (!(at instanceof BufferAttribute) || !(size instanceof BufferAttribute)) return;
    at.copyArray(positions);
    at.needsUpdate = true;
    for (const index of grow) size.setX(index, (this.#sizes[index * 3] ?? 0) * share);
    size.needsUpdate = grow.size > 0;
  }

  /** A frame's uniforms, the rings and the line on the chosen cluster. */
  frame({ camera, width, height, focal, near, far, chosen, target }: Frame): void {
    const set = this.#uniforms;
    set.uFocal.value = focal;
    set.uNear.value = near;
    set.uFarAt.value = far;
    set.uChosen.value = chosen;
    set.uLeast.value = values.least;
    set.uFar.value = values.far;
    set.uLight.value = values.light;
    set.uDustLight.value = values.dustLight;
    set.uGoldLift.value = values.goldLift;
    set.uDim.value = values.dim;
    set.uWarm.value = values.warm;
    this.#ringLook.opacity = values.ringLight;
    this.#rings.visible = target !== undefined;
    if (target !== undefined) {
      this.#rings.position.copy(target.centre);
      this.#rings.quaternion.copy(camera.quaternion);
      this.#rings.rotateX(RING_TILT);
      this.#rings.scale.setScalar(target.radius);
      const ndc = new Vector3().copy(target.landmark).project(camera);
      this.#line.uAt.value = { x: ndc.x, y: ndc.y };
    }
    this.#line.uHalf.value = (2 * LINE_HALF_PX) / height;
    this.#line.uLight.value = values.lineLight;
    this.#line.uPixels.value = { x: width / 2, y: LINE_HALF_PX };
  }
}
