// The Earth on the stage (frames 37 to 42): it comes when a page asks, stands in the circle that page keeps for it, and goes with the page.
// The real instant sets the sun's latitude and turns the ground under it; the sun's place on screen is the composition's, day towards the
// dock, night towards the plate. Then the globe turns east at a planet's rate, as the video's does, so the hour is true on arrival.
import { groundDirection, subSolarPoint } from "@gnoworld/core";
import { Euler, Vector3, type PerspectiveCamera, type Scene, type WebGLRenderer } from "three";
import { MOTION } from "../watch.ts";
import { SPIN } from "../planet/surfaceShader.ts";
import { Globe } from "./globe.ts";
import { loadEarthMaps } from "./maps.ts";
import { MOON_REST } from "./orbit.ts";
import { earthStats, type EarthStats } from "./stats.ts";

/** "loading", "drawn" and "failed" while a page shows the Earth; "gone" once it left. */
export type EarthState = "loading" | "drawn" | "failed" | "gone";

/** In the page's pixels. */
export interface Circle {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface EarthDevice {
  readonly renderer: {
    readonly capabilities: Pick<WebGLRenderer["capabilities"], "getMaxAnisotropy">;
    compileAsync: WebGLRenderer["compileAsync"];
  };
  readonly stage: Scene;
  readonly camera: PerspectiveCamera;
  /** Whether memory is short, asked at each load: the probe may have decided since. */
  readonly halved: () => boolean;
  /** Where the site is served from. */
  readonly base: string;
  /** A frame is owed. */
  readonly moved: () => void;
}

const ANISOTROPY = 8;
// How far round the sun stands from the ground's x: 50° right of the eye at rest, 165° on arrival, behind the globe's limb.
const SUN_REST = -0.698;
const SUN_SWEEP = 2.007;
const ARRIVAL = 2.6;
const MOON_RATE = 0.026;
const MOON_SWEEP = 1.5;

const eased = (share: number) => 1 - (1 - share) ** 3;

export class EarthView {
  readonly #device: EarthDevice;
  readonly #motion = matchMedia(MOTION);
  readonly #sun = new Vector3();
  readonly #tilt = new Euler();
  #said: (state: EarthState) => void = () => undefined;
  #state: EarthState = "gone";
  #circle: Circle | undefined;
  #globe: Globe | undefined;
  #asked = 0;
  #width = 1;
  #height = 1;
  #born: number | undefined;
  #latitude = 0;
  #turn = 0;
  #turned = 0;
  #age = 0;

  constructor(device: EarthDevice) {
    this.#device = device;
  }

  /** Whether the sun is still coming round: the scene holds the full rate for it. */
  get arriving(): boolean {
    return this.#globe !== undefined && !this.#motion.matches && this.#age < ARRIVAL;
  }

  #say(state: EarthState): void {
    this.#state = state;
    this.#said(state);
  }

  /** Stands the Earth in `circle`, or takes it away. */
  show(circle: Circle | undefined, said: (state: EarthState) => void): void {
    this.#said = said;
    const first = this.#circle === undefined;
    this.#circle = circle;
    if (circle === undefined) this.#leave();
    else if (first) this.#bring();
    else this.#place();
  }

  #leave(): void {
    this.#asked += 1;
    this.#drop();
    this.#say("gone");
  }

  #drop(): void {
    this.#globe?.dispose();
    this.#globe = undefined;
    this.#born = undefined;
    this.#age = 0;
  }

  #bring(): void {
    this.#asked += 1;
    const asked = this.#asked;
    this.#say("loading");
    this.#build().then(
      (globe) => {
        this.#stand(globe, asked);
      },
      () => {
        if (asked === this.#asked) this.#say("failed");
      },
    );
  }

  async #build(): Promise<Globe> {
    const { renderer, camera, stage, base, halved } = this.#device;
    const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), ANISOTROPY);
    const globe = new Globe(await loadEarthMaps(base, anisotropy, halved()));
    try {
      await renderer.compileAsync(globe.group, camera, stage);
    } catch (error) {
      globe.dispose();
      throw error;
    }
    return globe;
  }

  #stand(globe: Globe, asked: number): void {
    if (asked !== this.#asked) {
      globe.dispose();
      return;
    }
    this.#globe = globe;
    this.#aim();
    this.#device.stage.add(globe.group);
    this.#place();
    this.#pose(0);
    this.#say("drawn");
    this.#device.moved();
  }

  // The real sun, and the turn that puts it at the composition's place.
  #aim(): void {
    const { latitude, longitude } = subSolarPoint(Date.now());
    this.#latitude = latitude;
    this.#turn = longitude - SUN_REST;
  }

  /** The buffer's size, in the page's pixels. */
  resize(width: number, height: number): void {
    this.#width = width;
    this.#height = height;
    this.#place();
  }

  #focal(): number {
    return this.#height / 2 / Math.tan((this.#device.camera.fov * Math.PI) / 360);
  }

  #place(): void {
    const globe = this.#globe;
    const circle = this.#circle;
    if (globe === undefined || circle === undefined) return;
    const focal = this.#focal();
    const distance = Math.hypot(focal / circle.radius, 1);
    globe.group.position.set(
      ((circle.x - this.#width / 2) / focal) * distance,
      ((this.#height / 2 - circle.y) / focal) * distance,
      -distance,
    );
    this.#device.moved();
  }

  // The whole pose, `age` seconds after the Earth came.
  #pose(age: number): void {
    const globe = this.#globe;
    if (globe === undefined) return;
    this.#age = age;
    const arriving = Math.min(age / ARRIVAL, 1);
    const left = 1 - eased(arriving);
    this.#turned = this.#turn - SPIN * age;
    globe.earth.setTime(this.#turned / SPIN);
    const [x, y, z] = groundDirection({ latitude: this.#latitude, longitude: SUN_REST + left * SUN_SWEEP });
    this.#sun.set(x, y, z).applyEuler(this.#tilt.copy(globe.earth.group.rotation));
    globe.earth.setSun(this.#sun);
    globe.moon.setSun(this.#sun);
    globe.setMoon(MOON_REST + left * MOON_SWEEP - MOON_RATE * age);
  }

  /** Moves the Earth to `seconds` on the scene's clock. Under reduced motion it stays at rest. */
  tick(seconds: number): void {
    if (this.#globe === undefined) return;
    this.#born ??= seconds;
    if (this.#motion.matches) this.#pose(ARRIVAL);
    else this.#pose(seconds - this.#born);
  }

  /** A context came back: a closed bitmap cannot be uploaded twice, so the maps come again. */
  restored(): void {
    if (this.#circle === undefined) return;
    this.#drop();
    this.#bring();
  }

  dispose(): void {
    this.#asked += 1;
    this.#drop();
  }

  /** Where it all stands, for the journeys. */
  stats(): EarthStats | undefined {
    const { camera } = this.#device;
    const place = { width: this.#width, height: this.#height, focal: this.#focal(), eye: camera.position };
    return earthStats(this.#globe, { state: this.#state, turn: this.#turned }, place);
  }
}
