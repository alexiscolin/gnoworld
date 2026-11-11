// The skeleton of a planet that is not yet ready to be seen: its meridians and parallels as thin lines in the orbits' colour, at its size
// and tilt, turning with it; they fade out as the planet fades in inside them.
import { EARTH } from "@gnoworld/core";
import {
  BufferGeometry,
  Euler,
  Float32BufferAttribute,
  Group,
  LineSegments,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from "three";
import { ADDITIVE } from "../additive.ts";
import { LINE_FRAGMENT, RING_VERTEX } from "../shaders/glows.ts";
import { EARTH as EARTH_LOOK } from "../earth/look.ts";
import type { Planet, Vec } from "../layout.ts";
import { scaleOf } from "../boosts.ts";
import { worldOf } from "../planet/generated.ts";
import { setUniform } from "../planet/uniforms.ts";
import { SPIN } from "../planet/surfaceShader.ts";
import { ORBIT_COLOUR, ringOf } from "./marks.ts";

const MERIDIANS = 6;
const PARALLELS = [-60, -30, 0, 30, 60] as const;
// A circle of radius 1 round the y axis, the one the orbits are drawn from (marks.ts), turned into the sphere's great and small circles.
const FLAT = { place: { x: 0, y: 0, z: 0 }, across: { x: 1, y: 0, z: 0 }, along: { x: 0, y: 0, z: 1 } } as const;
// The lines are faint at their fullest: a frame of the sphere, not a drawing on it.
const GAIN = 0.45;

function sphere(): BufferGeometry {
  const circle = ringOf(FLAT, 1);
  const points: number[] = [];
  for (let m = 0; m < MERIDIANS; m++) {
    const [cos, sin] = [Math.cos((m / MERIDIANS) * Math.PI), Math.sin((m / MERIDIANS) * Math.PI)];
    for (let at = 0; at < circle.length; at += 3) {
      // The circle stood up (x, z to x, y), then turned about the pole.
      const [x, y] = [circle[at] ?? 0, circle[at + 2] ?? 0];
      points.push(x * cos, y, x * sin);
    }
  }
  for (const degrees of PARALLELS) {
    const lat = (degrees * Math.PI) / 180;
    for (let at = 0; at < circle.length; at += 3)
      points.push((circle[at] ?? 0) * Math.cos(lat), Math.sin(lat), (circle[at + 2] ?? 0) * Math.cos(lat));
  }
  return new BufferGeometry().setAttribute("position", new Float32BufferAttribute(points, 3));
}

interface Frame {
  readonly root: Group;
  /** The look's own lean and tilt. */
  readonly look: Quaternion;
  readonly lines: LineSegments<BufferGeometry, ShaderMaterial>;
}

export class Bones {
  readonly group = new Group();
  readonly #geometry = sphere();
  readonly #frames = new Map<number, Frame>();
  readonly #used = new Set<number>();

  /** Starts a frame: the skeletons not shown before `end` are hidden. */
  begin(): void {
    this.#used.clear();
  }

  /** Shows `planet`'s skeleton at `at`, as large as its quad, in the planet's own tilt, lean and spin at `seconds`. */
  show(
    planet: Planet,
    {
      at,
      seconds,
      opacity,
      leaned,
      ahead = 0,
    }: { at: Vec; seconds: number; opacity: number; leaned?: Quaternion | undefined; ahead?: number },
  ): void {
    const index = planet.index;
    this.#used.add(index);
    let frame = this.#frames.get(index);
    if (frame === undefined) {
      const { lean, tilt } = planet.id === EARTH ? EARTH_LOOK : worldOf(planet.id).look;
      const lines = new LineSegments(
        this.#geometry,
        new ShaderMaterial({
          uniforms: { uColour: { value: new Vector3(...ORBIT_COLOUR) }, uGain: { value: 0 } },
          vertexShader: RING_VERTEX,
          fragmentShader: LINE_FRAGMENT,
          transparent: true,
          depthWrite: false,
          ...ADDITIVE,
        }),
      );
      lines.renderOrder = -1;
      const root = new Group();
      const look = new Quaternion().setFromEuler(new Euler(lean, 0, tilt));
      root.add(lines);
      this.group.add(root);
      frame = { root, look, lines };
      this.#frames.set(index, frame);
    }
    frame.root.visible = true;
    frame.root.position.set(at.x, at.y, at.z);
    frame.root.scale.setScalar(planet.radius * scaleOf(index));
    // The planet's own frame (near.ts's #place): its lean toward the eye over its look, its spin led by `ahead`.
    if (leaned === undefined) frame.root.quaternion.copy(frame.look);
    else frame.root.quaternion.copy(leaned).multiply(frame.look);
    frame.lines.rotation.y = -(seconds + ahead) * SPIN;
    setUniform(frame.lines.material.uniforms, "uGain", GAIN * opacity);
  }

  /** Ends the frame: every skeleton not shown in it is hidden. */
  end(): void {
    for (const [index, frame] of this.#frames) frame.root.visible = this.#used.has(index);
  }

  /** Hides every skeleton. */
  clear(): void {
    this.begin();
    this.end();
  }

  dispose(): void {
    for (const { lines } of this.#frames.values()) lines.material.dispose();
    this.#geometry.dispose();
  }
}
