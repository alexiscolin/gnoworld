// What the demo draws over the universe for the place the camera is at (D401): the orbits of the system it is in, faint, and on a
// page the plate's fill, behind the planet, as the video's frame 20 (the planet stands over the plate's right side); a planet framed
// close wears one orbit (D458).
import {
  BufferGeometry,
  Float32BufferAttribute,
  LineSegments,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from "three";
import { placeOf, type Planet, type System, type Vec } from "../layout.ts";
import type { Pose } from "../rig/pose.ts";
import { LINE_FRAGMENT, LINE_VERTEX, PLATE_FRAGMENT, PLATE_VERTEX, RING_VERTEX } from "../shaders/glows.ts";
import { newPlateMask } from "../planet/plateMask.ts";
import { beforeGrade } from "../renderer.ts";
import { ADDITIVE } from "../additive.ts";

const SEGMENTS = 128;
/** The orbits' colour and their strength at full, which the Map's links share (links.ts). */
export const ORBIT_COLOUR = [0.75, 0.78, 0.9] as const;
export const ORBIT_GAIN = 0.13;
// The orbit round a planet framed close: its radius in the planet's, how high the eye stands over its plane (sin 5°: nearly edge
// on, its near side passing low over the planet, its far side behind it), how it leans across the view, its strength, and its moment.
const ROUND = { radii: 1.25, over: 0.087, lean: -0.3, gain: 0.2, ease: 0.3 } as const;
const Y = new Vector3(0, 1, 0);
const FLAT = { place: { x: 0, y: 0, z: 0 }, across: { x: 1, y: 0, z: 0 }, along: { x: 0, y: 0, z: 1 } } as const;

// The orbit `orbit` of `system` as line segments: each segment's two ends, x, y, z.
function ringOf({ place, across, along }: Pick<System, "place" | "across" | "along">, orbit: number): number[] {
  const points: number[] = [];
  for (let at = 0; at < SEGMENTS; at += 1)
    for (const step of [at, at + 1]) {
      const angle = (step / SEGMENTS) * Math.PI * 2;
      const [cos, sin] = [Math.cos(angle) * orbit, Math.sin(angle) * orbit];
      points.push(
        place.x + across.x * cos + along.x * sin,
        place.y + across.y * cos + along.y * sin,
        place.z + across.z * cos + along.z * sin,
      );
    }
  return points;
}

export class Orbits {
  readonly gain = { value: 0 };
  readonly lines = new LineSegments(
    new BufferGeometry(),
    new ShaderMaterial({
      uniforms: { uColour: { value: new Vector3(...ORBIT_COLOUR) }, uGain: this.gain },
      vertexShader: LINE_VERTEX,
      fragmentShader: LINE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      ...ADDITIVE,
    }),
  );
  #of: System | undefined;

  constructor() {
    this.lines.frustumCulled = false;
  }

  /** Draws the orbits of `system`; none, none. */
  of(system: System | undefined): void {
    if (system === this.#of) return;
    this.#of = system;
    const points = system === undefined ? [] : system.planets.flatMap(({ orbit }) => ringOf(system, orbit));
    this.lines.geometry.dispose();
    this.lines.geometry = new BufferGeometry();
    this.lines.geometry.setAttribute("position", new Float32BufferAttribute(points, 3));
  }

  get system(): System | undefined {
    return this.#of;
  }

  dispose(): void {
    this.lines.geometry.dispose();
    this.lines.material.dispose();
  }
}

/** One orbit round the planet a page frames close (D458): thin and faint, the planet hiding it where it passes behind; its plane
 * set by the eye as it shows, then held, so a drag turns round it as round any orbit. */
export class Round {
  readonly gain = { value: 0 };
  readonly lines = new LineSegments(
    // A circle of radius 1 round the y axis, which the mesh places.
    new BufferGeometry().setAttribute("position", new Float32BufferAttribute(ringOf(FLAT, 1), 3)),
    new ShaderMaterial({
      uniforms: { uColour: { value: new Vector3(...ORBIT_COLOUR) }, uGain: this.gain },
      vertexShader: RING_VERTEX,
      fragmentShader: LINE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      ...ADDITIVE,
    }),
  );
  readonly #at: Vec = { x: 0, y: 0, z: 0 };
  readonly #up = new Vector3();
  readonly #way = new Vector3();
  readonly #side = new Vector3();
  #seconds = 0;

  constructor() {
    this.lines.visible = false;
  }

  /** Round `planet`, `seconds` on, as seen from `pose`, coming or going over a moment; none, it goes. */
  follow(planet: Planet | undefined, pose: Pose, seconds: number): void {
    if (planet !== undefined && this.gain.value < 1e-3) this.#face(pose);
    const share = 1 - Math.exp(-Math.max(seconds - this.#seconds, 0) / ROUND.ease);
    this.#seconds = seconds;
    this.gain.value += ((planet === undefined ? 0 : ROUND.gain) - this.gain.value) * share;
    this.lines.visible = this.gain.value > 1e-3;
    if (planet === undefined || !this.lines.visible) return;
    placeOf(planet, seconds, this.#at);
    this.lines.position.set(this.#at.x, this.#at.y, this.#at.z);
    this.lines.scale.setScalar(planet.radius * ROUND.radii);
  }

  // The plane the eye stands just over, leaning across the view.
  #face({ way, up }: Pose): void {
    const towards = this.#way.set(way.x, way.y, way.z);
    const side = this.#side.set(up.x, up.y, up.z).cross(towards).normalize();
    const lifted = this.#up.copy(towards).cross(side).multiplyScalar(Math.cos(ROUND.lean));
    lifted.addScaledVector(side, Math.sin(ROUND.lean)).multiplyScalar(Math.sqrt(1 - ROUND.over ** 2));
    this.lines.quaternion.setFromUnitVectors(Y, lifted.addScaledVector(towards, ROUND.over).normalize());
  }

  dispose(): void {
    this.lines.geometry.dispose();
    this.lines.material.dispose();
  }
}

export class Plate {
  /** Where it stands on the screen, shared with what keeps off its words (D490). */
  readonly mask = newPlateMask();
  readonly shown = this.mask.uShown;
  readonly #box = this.mask.uBox;
  readonly #fade = this.mask.uFade;
  readonly #height = this.mask.uHeight;
  readonly #round = this.mask.uRound;
  readonly #width = { value: 0 };
  readonly mesh = new Mesh(
    new PlaneGeometry(2, 2),
    new ShaderMaterial({
      uniforms: {
        uBox: this.#box,
        uFade: this.#fade,
        uShown: this.shown,
        uHeight: this.#height,
        uWidth: this.#width,
        uRound: this.#round,
        // The plate's fill as the page's (--color-surface), before the grade: graded with the frame, straight or through the blur's pass.
        uFill: { value: new Vector3(...beforeGrade([0.118, 0.13, 0.176])) },
      },
      vertexShader: PLATE_VERTEX,
      fragmentShader: PLATE_FRAGMENT,
      transparent: true,
      depthWrite: false,
    }),
  );

  constructor() {
    this.mesh.frustumCulled = false;
    // After the lights (additive, at 0), so the plate covers the far suns and dust behind the page's words; before a planet's air,
    // ring and halo (1 to 3, planet/planet.ts), which stand over it (Alexis, 2026-11-08); the planets, opaque, in front by depth.
    this.mesh.renderOrder = 0.5;
  }

  /** The plate's box on the page, its text's right edge where the fill starts fading, in the page's pixels; `ratio` the buffer's. */
  place(
    box: { left: number; top: number; right: number; bottom: number },
    fade: number,
    { width, height, ratio }: { width?: number; height: number; ratio: number },
  ): void {
    this.#box.value.set(box.left * ratio, box.top * ratio, box.right * ratio, box.bottom * ratio);
    this.#fade.value = fade * ratio;
    this.#height.value = height * ratio;
    this.#width.value = (width ?? 0) * ratio;
    this.#round.value = 18 * ratio;
  }

  /** Hides the quad while its fill is under half a level, so a frame with no page does not draw a layer of nothing. */
  sync(): void {
    this.mesh.visible = this.shown.value > 0.002;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
