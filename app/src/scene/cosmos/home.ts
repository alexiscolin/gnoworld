// The Earth among the worlds (frame 4), a fixed place beside the great star: the very globe of its page, small, its ring a thin line. It
// stands apart from any file. It turns with the camera, which looks at it, so it shows the same face from any view, lit from its star.
import { CENTRE, EARTH_PLACE, EARTH_RADIUS, toScene, type Point } from "@gnoworld/core";
import { BufferGeometry, LineBasicMaterial, LineLoop, Quaternion, Vector3, type Group } from "three";
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
  readonly #toward = new Vector3();
  readonly #back = new Quaternion();
  readonly #unlean = new Quaternion();
  #globe: Globe | undefined;
  #line: LineLoop<BufferGeometry, LineBasicMaterial> | undefined;
  #building = false;
  #said = false;
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
    // Only the load still current unlocks the next: an old one answering late must not start a second Earth (F3571).
    const settled = () => {
      if (loading === this.#loading) this.#building = false;
    };
    buildGlobe({ ...this.#device, halved: () => true }, loading.signal).then((globe) => {
      settled();
      if (globe === undefined) return;
      if (loading.signal.aborted || this.#globe !== undefined) globe.dispose();
      else this.#place(globe);
    }, settled);
  }

  #place(globe: Globe): void {
    this.#globe = globe;
    this.#parent.add(globe.group);
    this.#line = ringLine();
    globe.stand(EARTH_RADIUS, this.#line);
    this.#device.moved();
    if (!this.#said) this.#device.stood();
    this.#said = true;
  }

  /** One frame on, from `eye`, the camera turned `turned`. */
  tick(eye: Point, seconds: number, turned: Quaternion): void {
    const globe = this.#globe;
    if (globe === undefined) return;
    toScene(EARTH_PLACE, this.#stage);
    const { x, y, z } = this.#stage;
    globe.group.position.set(x - eye.x, y - eye.y, z - eye.z);
    globe.group.quaternion.copy(turned);
    // The great star, as the turned and leaned Earth sees it: its height is the sun's latitude, its way round the sun's azimuth. The globe
    // lights its ground past its lean, then its turn (Globe.setSun): both are undone here.
    const toward = this.#toward
      .set(CENTRE.x - x, CENTRE.y - y, CENTRE.z - z)
      .applyQuaternion(this.#back.copy(turned).invert())
      .applyQuaternion(this.#unlean.setFromEuler(globe.lean).invert());
    toward.normalize();
    globe.aim(Math.asin(toward.y));
    globe.setSun(Math.atan2(-toward.z, toward.x));
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
