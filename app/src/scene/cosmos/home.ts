// The Earth among the worlds (frame 4), a fixed place beside the great star: the very globe of its page, small, its ring a thin line. It
// stands apart from any file, and its star stands still from it, so its light is set once.
import { CENTRE, EARTH_PLACE, EARTH_RADIUS, toScene, type Point } from "@gnoworld/core";
import { BufferGeometry, LineBasicMaterial, LineLoop, Vector3, type Group } from "three";
import { buildGlobe, type Globe } from "../earth/globe.ts";
import { MOON_FAR, ORBIT_RADIUS } from "../earth/orbit.ts";
import type { EarthDevice } from "../earth/device.ts";
import { SPIN } from "../planet/surfaceShader.ts";

const MOON_RATE = 0.026;
const LINE_POINTS = 128;
const LINE_COLOUR = 0xfff0dd;
const LINE_OPACITY = 0.22;

// Frame 4's orbit: a pixel wide, about a fifth of the way to white. A new line each stand: the old one goes with its globe's owner.
function ringLine(): LineLoop<BufferGeometry, LineBasicMaterial> {
  const points = Array.from({ length: LINE_POINTS }, (_, at) => {
    const angle = (at * 2 * Math.PI) / LINE_POINTS;
    return new Vector3(ORBIT_RADIUS * Math.cos(angle), 0, ORBIT_RADIUS * Math.sin(angle));
  });
  return new LineLoop(
    new BufferGeometry().setFromPoints(points),
    new LineBasicMaterial({ color: LINE_COLOUR, opacity: LINE_OPACITY, transparent: true, depthWrite: false }),
  );
}

export class Home {
  readonly #device: EarthDevice;
  readonly #parent: Group;
  readonly #stage = { x: 0, y: 0, z: 0 };
  #globe: Globe | undefined;
  #line: LineLoop<BufferGeometry, LineBasicMaterial> | undefined;
  #building = false;
  #loading = new AbortController();

  constructor(device: EarthDevice, parent: Group) {
    this.#device = device;
    this.#parent = parent;
  }

  get stood(): boolean {
    return this.#globe !== undefined;
  }

  /** Where it stands from the eye, in the journeys' reading. */
  get at(): Vector3 | undefined {
    return this.#globe?.group.position;
  }

  /** Brings it, once. A globe that does not come leaves the worlds as they are. */
  stand(): void {
    if (this.#globe !== undefined || this.#building) return;
    this.#building = true;
    const loading = this.#loading;
    buildGlobe({ ...this.#device, halved: () => true }, loading.signal).then(
      (globe) => {
        this.#building = false;
        if (globe === undefined) return;
        if (loading.signal.aborted) globe.dispose();
        else this.#place(globe);
      },
      () => {
        this.#building = false;
      },
    );
  }

  #place(globe: Globe): void {
    this.#globe = globe;
    this.#parent.add(globe.group);
    this.#line = ringLine();
    globe.stand(EARTH_RADIUS, this.#line);
    toScene(EARTH_PLACE, this.#stage);
    const { x, y, z } = this.#stage;
    const toward = new Vector3(CENTRE.x - x, CENTRE.y - y, CENTRE.z - z).normalize();
    globe.aim(Math.asin(toward.y));
    globe.setSun(Math.atan2(-toward.z, toward.x));
    this.#device.moved();
  }

  /** One frame on, from `eye`. */
  tick(eye: Point, seconds: number): void {
    const globe = this.#globe;
    if (globe === undefined) return;
    toScene(EARTH_PLACE, this.#stage);
    globe.group.position.set(this.#stage.x - eye.x, this.#stage.y - eye.y, this.#stage.z - eye.z);
    const turn = -SPIN * seconds;
    globe.setTurn(turn, turn);
    globe.setMoon(MOON_FAR - MOON_RATE * seconds);
  }

  /** Frees it, and what is on its way. It may stand again. */
  drop(): void {
    this.#loading.abort();
    this.#loading = new AbortController();
    this.#globe?.dispose();
    this.#globe = undefined;
    this.#building = false;
    this.#line?.geometry.dispose();
    this.#line?.material.dispose();
    this.#line = undefined;
  }
}
