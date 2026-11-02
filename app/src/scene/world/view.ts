// A world on the stage, seen close on its page (frames 20 to 35, 90 to 107, 115 to 125): it comes when the page asks, stands in the circle the
// page keeps for it as the Earth does, lit from the dock's side, and goes with the page. Real shadows fall on it alone, and not where memory
// is short: the moons' and the ring moon's, through its overlay. What a frame runs writes into what is kept: nothing is made there.
import type { StatusOrbit, WorldSigns } from "@gnoworld/core";
import { Object3D, Vector3, Vector4 } from "three";
import type { Circle, EarthDevice, EarthState } from "../earth/device.ts";
import { focalOf, projector, standIn } from "../lens.ts";
import { sideLight } from "../planet/light.ts";
import { MOTION } from "../watch.ts";
import type { MoonMark } from "./orbiting.ts";
import type { WorldReading } from "./reading.ts";
import { Standing } from "./standing.ts";
import { statsOf } from "./stats.ts";
import { Wake } from "./wake.ts";
import type { WorldBody } from "./body.ts";

export type { MoonMark };

// A world at rest fills this share of the circle; a busy one grows to fill it, a seed is a small heart in it.
const REST = 0.8;
const NO_CASTER: readonly Vector4[] = [];

export type WorldSaid = (state: EarthState, colour?: string) => void;

export interface WorldPlace {
  readonly circle: Circle;
  readonly id: string;
}

export class WorldView {
  readonly #device: EarthDevice;
  readonly #motion = matchMedia(MOTION);
  readonly #rest = new Vector3();
  readonly #sun = new Vector3();
  readonly #ringCaster = new Vector4();
  readonly #screen = { width: 1, height: 1, ratio: 1 };
  readonly #sight: { project: ReturnType<typeof projector>; words: number; world: Object3D; disc: number };
  readonly #ringPlace = new Vector3();
  readonly #scale = new Vector3();
  #said: WorldSaid = () => undefined;
  #state: EarthState = "gone";
  #circle: Circle | undefined;
  #standing: Standing | undefined;
  #reading: WorldReading | undefined;
  #orbit: StatusOrbit | undefined;
  #marks: readonly MoonMark[] = [];
  readonly #waking = new Wake();
  #fit = REST;
  #shadows = 0;
  // The world that could not come: placed again, it is not asked again. Another id, or a context restored, tries again.
  #failed: string | undefined;

  constructor(device: EarthDevice) {
    this.#device = device;
    this.#sight = { project: projector(device.camera, this.#screen), words: -Infinity, world: new Object3D(), disc: 0 };
  }

  #say(state: EarthState, colour?: string): void {
    this.#said((this.#state = state), colour);
  }

  /** Stands the world `place` names in its circle, another in place of the last, or takes it away. */
  show(place: WorldPlace | undefined, said: WorldSaid): void {
    this.#said = said;
    this.#circle = place?.circle;
    if (place === undefined) {
      this.#drop();
      this.#say("gone");
    } else if (this.#standing?.id !== place.id && this.#failed !== place.id) {
      this.#drop();
      this.#bring(place.id);
    } else this.#place();
  }

  #bring(id: string): void {
    const standing: Standing = new Standing(this.#device, id, {
      arrived: () => {
        this.#stand(standing);
      },
      failed: () => {
        if (this.#standing !== standing || standing.body !== undefined) return;
        this.#drop();
        this.#failed = id;
        this.#say("failed");
      },
    });
    this.#standing = standing;
    this.#waking.reset();
    this.#say("loading");
    this.#stand(standing);
  }

  // Once every map is here: built, compiled off the frame, then on the stage. A page that named another world meanwhile has dropped it.
  #stand(standing: Standing): void {
    if (standing.body !== undefined) {
      standing.moons?.retry();
      this.#device.moved();
      return;
    }
    const body = standing.build();
    if (body === undefined) return;
    const { renderer, camera, stage } = this.#device;
    const ready = () => {
      if (this.#standing !== standing) return;
      stage.add(body.group);
      body.setRing(this.#orbit);
      standing.moons?.set(this.#marks);
      this.#place();
      this.#say("drawn", standing.colour);
      this.#device.stood();
    };
    renderer.compileAsync(body.group, camera, stage).then(ready, ready);
  }

  #drop(): void {
    this.#standing?.dispose();
    if (this.#standing !== undefined) this.#device.camera.clearViewOffset();
    this.#standing = undefined;
    this.#failed = undefined;
    this.#shadows = 0;
  }

  /** The buffer's size, in the page's pixels, and its pixels to one of the page's. */
  resize(width: number, height: number, ratio: number): void {
    Object.assign(this.#screen, { width, height, ratio });
    this.#place();
  }

  #place(): void {
    const body = this.#standing?.body;
    if (body === undefined || this.#circle === undefined) return;
    this.#rest.set(0, 0, -standIn(this.#device.camera, this.#screen, this.#circle));
    body.group.position.copy(this.#rest);
    body.ground.show(this.#circle.plate);
    body.ground.resize(this.#screen.height, this.#screen.ratio);
    this.#sight.words = this.#circle.plate?.right ?? -Infinity;
    this.#device.moved();
  }

  /** What the world's data says now. */
  read(reading: WorldReading): void {
    this.#waking.read(reading, this.#reading);
    this.#reading = reading;
    this.#device.moved();
  }

  /** The status ring for what the realm reports, or none. */
  ring(orbit: StatusOrbit | undefined): void {
    this.#orbit = orbit;
    this.#standing?.body?.setRing(orbit);
    this.#device.moved();
  }

  /** The rooms' moons, in place of the last. */
  moons(marks: readonly MoonMark[]): void {
    this.#marks = marks;
    this.#standing?.moons?.set(marks);
    this.#device.moved();
  }

  /** Moves the world to `seconds` on the scene's clock. Under reduced motion nothing moves. */
  tick(seconds: number): void {
    const standing = this.#standing;
    const body = standing?.body;
    if (standing === undefined || body === undefined || body.group.parent === null) return;
    const still = this.#motion.matches;
    this.#grow(body, this.#waking.signsAt(this.#reading, seconds, still));
    // The eye looks about slowly: the world turns with it, so it stays in its circle, lit from the same side of the screen.
    const { quaternion } = this.#device.camera;
    body.group.position.copy(this.#rest).applyQuaternion(quaternion);
    body.group.quaternion.copy(quaternion);
    body.setSun(sideLight(standing.seed, this.#sun).applyQuaternion(quaternion));
    body.setTime(still ? 0 : seconds);
    standing.moons?.tick(still ? 0 : seconds, this.#sun);
    this.#pose(standing);
  }

  #grow(body: WorldBody, signs: WorldSigns | undefined): void {
    this.#fit = Math.min(1, REST * (signs?.size ?? 1));
    body.sized.scale.setScalar(this.#fit);
    body.setWake(this.#waking.left);
    if (signs !== undefined && this.#reading !== undefined) body.setSigns(signs, this.#reading);
  }

  // Where the moons fall on the page, and who casts on the world: its moons and the ring's, none where memory is short.
  #pose({ body, moons }: Standing): void {
    if (body === undefined) return;
    body.group.updateMatrixWorld(true);
    this.#sight.disc = this.#disc();
    this.#sight.world = body.group;
    moons?.pose(this.#sight);
    const { x, y, z } = body.ringMoon.group.getWorldPosition(this.#ringPlace);
    this.#ringCaster.set(x, y, z, body.ringMoon.group.getWorldScale(this.#scale).x);
    const ring = this.#orbit === undefined ? undefined : this.#ringCaster;
    const halved = this.#device.halved();
    this.#shadows = body.setCasters(halved ? NO_CASTER : (moons?.casters ?? NO_CASTER), halved ? undefined : ring);
  }

  #disc(): number {
    const far = this.#rest.length();
    return (
      (focalOf(this.#device.camera, this.#screen.height) * this.#fit) /
      Math.sqrt(Math.max(far * far - this.#fit * this.#fit, 1e-9))
    );
  }

  /** A context came back: a closed bitmap cannot be uploaded twice, so the maps come again. */
  restored(): void {
    const id = this.#standing?.id ?? this.#failed;
    if (id === undefined) return;
    const waking = this.#waking.keep();
    this.#drop();
    this.#bring(id);
    this.#waking.restore(waking);
  }

  dispose(): void {
    this.#drop();
  }

  /** Where it all stands, for the journeys. */
  stats() {
    const standing = this.#standing;
    return statsOf({
      state: this.#state,
      standing,
      centre:
        standing?.body === undefined ? undefined : this.#sight.project(standing.body.group.position, new Vector3()),
      disc: this.#disc(),
      fit: this.#fit,
      wake: this.#waking.left,
      orbit: this.#orbit,
      reading: this.#reading,
      shadows: this.#shadows,
      sun: this.#sun,
    });
  }
}

export type WorldStats = ReturnType<WorldView["stats"]>;
