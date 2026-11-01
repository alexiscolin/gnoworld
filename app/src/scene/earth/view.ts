// The Earth on the stage (frames 37 to 42): it comes when a page asks, stands in the circle that page keeps for it, and goes with the page.
// The real instant sets the sun's latitude and turns the ground under it; the sun's place on screen is the composition's, day towards the
// dock, night towards the plate. Then the globe turns east at a planet's rate, as the video's does, so the hour is true on arrival.
import { subSolarPoint } from "@gnoworld/core";
import { Vector3 } from "three";
import { SPIN } from "../planet/surfaceShader.ts";
import { MOTION } from "../watch.ts";
import type { EarthDevice } from "./device.ts";
import { buildGlobe, type Globe } from "./globe.ts";
import type { PlateGround } from "./ground.ts";
import { eased, EyeTurn, GroundMarks, type Ground, type GroundMark, type LatLon, type Pose } from "./marks.ts";
import { MOON_REST } from "./orbit.ts";
import { earthStats, type EarthStats } from "./stats.ts";

/** "loading", "drawn" and "failed" while a page shows the Earth; "gone" once it left. */
export type EarthState = "loading" | "drawn" | "failed" | "gone";

/** In the page's pixels, with the plate beside it, where the page fixes one. */
export interface Circle {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly plate?: PlateGround;
}

/** How far round the sun stands from the ground's x: 69° right of the eye at rest, as frame 39. */
export const SUN_REST = -0.37;
// On arrival, 165° right of the eye: behind the globe's limb.
const SUN_SWEEP = 1.68;
const ARRIVAL = 2.6;
const SETTLING = 1;
const SETTLE_LEFT = 0.19;
const SETTLE_NEARER = 0.06;
// The first frames can still stall, and the arrival is what the reader must see.
const LONGEST_FRAME = 0.05;
const MOON_RATE = 0.026;
const MOON_SWEEP = 1.5;

export class EarthView implements Ground {
  readonly #device: EarthDevice;
  readonly #motion = matchMedia(MOTION);
  readonly #rest = new Vector3();
  readonly #marks = new GroundMarks();
  readonly #eye = new EyeTurn();
  #said: (state: EarthState) => void = () => undefined;
  #state: EarthState = "gone";
  #circle: Circle | undefined;
  #globe: Globe | undefined;
  #asked = 0;
  #width = 1;
  #height = 1;
  #ratio = 1;
  #born: number | undefined;
  #age = 0;
  #arrived = 0;
  #sunAt = Number.NaN;
  #turn = 0;
  #turned = 0;
  #drawn = 0;

  constructor(device: EarthDevice) {
    this.#device = device;
  }

  /** Whether the sun is still coming round, or the eye is on its way to a place: the scene holds the full rate for them. */
  get arriving(): boolean {
    return this.#globe !== undefined && !this.#motion.matches && (this.#arrived < ARRIVAL || this.#eye.busy(this.#age));
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
    this.#device.camera.clearViewOffset();
    this.#born = undefined;
    this.#age = 0;
    this.#arrived = 0;
    this.#sunAt = Number.NaN;
    this.#drawn = 0;
    this.#eye.reset();
  }

  #bring(): void {
    this.#asked += 1;
    const asked = this.#asked;
    this.#say("loading");
    buildGlobe(this.#device, () => asked !== this.#asked).then(
      (globe) => {
        if (globe !== undefined) this.#stand(globe);
      },
      () => {
        if (asked === this.#asked) this.#say("failed");
      },
    );
  }

  #stand(globe: Globe): void {
    this.#globe = globe;
    const { latitude, longitude } = subSolarPoint(Date.now());
    globe.aim(latitude);
    this.#turn = longitude - SUN_REST;
    this.#device.stage.add(globe.group);
    this.#place();
    this.#say("drawn");
  }

  /** The buffer's size, in the page's pixels, and its pixels to one of the page's. */
  resize(width: number, height: number, ratio: number): void {
    this.#width = width;
    this.#height = height;
    this.#ratio = ratio;
    this.#place();
  }

  #focal(): number {
    return this.#height / 2 / Math.tan((this.#device.camera.fov * Math.PI) / 360);
  }

  // A lens shift and not a moved sphere: off the axis, a sphere's picture is no circle, and stands away from the one the page keeps.
  #place(): void {
    const globe = this.#globe;
    const circle = this.#circle;
    if (globe === undefined || circle === undefined) return;
    const { camera, moved } = this.#device;
    camera.setViewOffset(
      this.#width,
      this.#height,
      this.#width / 2 - circle.x,
      this.#height / 2 - circle.y,
      this.#width,
      this.#height,
    );
    this.#rest.set(0, 0, -Math.hypot(this.#focal() / circle.radius, 1));
    globe.ground.show(circle.plate);
    globe.ground.resize(this.#height, this.#ratio);
    this.#pose(this.#age, this.#motion.matches ? ARRIVAL : this.#arrived);
    moved();
  }

  // The whole pose, `age` seconds after the Earth came and `arrived` seconds into its arrival. It runs on a frame: nothing is made here.
  #pose(age: number, arrived: number): void {
    const globe = this.#globe;
    if (globe === undefined) return;
    const left = 1 - eased(arrived / ARRIVAL);
    const gone = this.#eye.at(age, this.#motion.matches);
    const sunAt = SUN_REST + left * SUN_SWEEP - gone;
    if (sunAt !== this.#sunAt) globe.setSun(sunAt);
    this.#sunAt = sunAt;
    const settling = 1 - eased(arrived / SETTLING);
    this.#turned = this.#turn + gone - SPIN * age;
    globe.setTurn(this.#turned);
    globe.setMoon(MOON_REST + left * MOON_SWEEP - MOON_RATE * age);
    globe.group.position.copy(this.#rest).setX(-SETTLE_LEFT * settling);
    globe.group.scale.setScalar(1 + SETTLE_NEARER * settling);
    this.#marks.place(this.#where(globe), { width: this.#width, height: this.#height, camera: this.#device.camera });
  }

  #poseNow(): void {
    this.#pose(this.#age, this.#motion.matches ? ARRIVAL : this.#arrived);
    this.#device.moved();
  }

  #where(globe: Globe): Pose {
    const { position, scale } = globe.group;
    return { turn: this.#turned, lean: globe.lean, centre: position, scale: scale.x };
  }

  setMarks(marks: readonly GroundMark[]): void {
    this.#marks.set(marks);
    if (this.#globe === undefined) return;
    this.#poseNow();
  }

  facing(): LatLon | undefined {
    return this.#globe === undefined ? undefined : this.#marks.facing(this.#where(this.#globe));
  }

  face({ lon }: LatLon): void {
    const here = this.facing();
    if (here === undefined) return;
    this.#eye.by(lon - here.lon, this.#age);
    this.#poseNow();
  }

  /** Moves the Earth to `seconds` on the scene's clock. Under reduced motion it stays at rest. */
  tick(seconds: number): void {
    if (this.#globe === undefined) return;
    this.#drawn += 1;
    if (this.#motion.matches) {
      this.#pose(0, ARRIVAL);
      return;
    }
    this.#born ??= seconds;
    const age = seconds - this.#born;
    this.#arrived = Math.min(this.#arrived + Math.min(age - this.#age, LONGEST_FRAME), ARRIVAL);
    this.#age = age;
    this.#pose(age, this.#arrived);
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
    const status = { state: this.#state, turn: this.#turned, drawn: this.#drawn };
    return earthStats(this.#globe, status, { width: this.#width, height: this.#height, camera });
  }
}
