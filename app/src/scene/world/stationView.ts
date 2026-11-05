// A station's page in the scene (part 8l; Alexis, 2026-11-05, "même vue que les planètes mais pour les stations"): the station its name builds,
// as round the Earth (station/stations.ts), stood in the circle the page keeps for its world, lit from the right as a world is, and gone with
// the page. Its wheels turn; under reduced motion nothing does.
import { between, stationOf, textHash } from "@gnoworld/core";
import { Group, Vector3 } from "three";
import type { Circle, EarthDevice } from "../earth/device.ts";
import { Ground } from "../earth/ground.ts";
import { broughtTo, restIn, type Screen as Page } from "../lens.ts";
import { sideLight } from "../planet/light.ts";
import { lightsOf } from "../station/shapes.ts";
import { StationsDrawn } from "../station/stations.ts";

/** The buffer, in the page's pixels, and its pixels to one of the page's. */
type Screen = Page & { readonly ratio: number };
import { motionOf } from "../watch.ts";
import type { WorldSaid } from "./view.ts";

/** A station round the Earth as the team's file gives it: its name, its seed, and its size, 0 a small satellite to 1 an artificial world. */
export interface StationAsk {
  readonly circle: Circle;
  readonly name: string;
  readonly size: number;
  /** Keeps this reader's visit once it stands. */
  readonly remember: (fresh: boolean) => void;
}

// The station's reach, a share of the circle's, from a small satellite's to an artificial world's: a station is as big as the team's file
// says, never all of one size, and comes to the circle's edge at most.
const REACH = [0.55, 0.95] as const;

export class StationView {
  readonly #device: EarthDevice;
  readonly #motion = motionOf();
  readonly #rest = new Vector3();
  readonly #screen: Screen;
  #standing:
    | { readonly name: string; readonly group: Group; readonly drawn: StationsDrawn; readonly ground: Ground }
    | undefined;
  #ask: StationAsk | undefined;

  /** On `device`, over the buffer `screen` measures, which its owner keeps up to date and places it again on. */
  constructor(device: EarthDevice, screen: Screen) {
    this.#device = device;
    this.#screen = screen;
  }

  /** Stands the station `ask` names in its circle, another in place of the last, or takes it away. */
  show(ask: StationAsk | undefined, said: WorldSaid): void {
    this.#ask = ask;
    if (ask === undefined) {
      if (this.#standing !== undefined) said("gone");
      this.#drop();
      return;
    }
    if (this.#standing?.name === ask.name) {
      this.place();
      return;
    }
    this.#drop();
    said("loading");
    this.#stand(ask, said);
  }

  #stand(ask: StationAsk, said: WorldSaid): void {
    const drawn = new StationsDrawn();
    drawn.stand([
      { station: stationOf(ask.name, ask.size), at: { x: 0, y: 0, z: 0 }, radius: between(REACH, ask.size) },
    ]);
    const ground = new Ground();
    const group = new Group();
    const sun = sideLight(new Uint8Array(new Uint32Array([textHash(ask.name)]).buffer), new Vector3());
    group.add(ground.mesh, drawn.group, ...lightsOf(sun));
    const standing = { name: ask.name, group, drawn, ground };
    this.#standing = standing;
    const { renderer, camera, stage } = this.#device;
    const ready = () => {
      if (this.#standing !== standing) return;
      stage.add(group);
      this.place();
      said("drawn");
      ask.remember(false);
      this.#device.stood();
    };
    renderer.compileAsync(group, camera, stage).then(ready, ready);
  }

  #drop(): void {
    const standing = this.#standing;
    if (standing === undefined) return;
    standing.group.removeFromParent();
    standing.drawn.dispose();
    standing.ground.dispose();
    this.#device.camera.clearViewOffset();
    this.#standing = undefined;
  }

  /** Stands the station in its circle again, the screen or the circle changed. */
  place(): void {
    const standing = this.#standing;
    const circle = this.#ask?.circle;
    if (standing === undefined || circle === undefined || standing.group.parent === null) return;
    restIn(standing.group, this.#rest, { camera: this.#device.camera, screen: this.#screen, circle });
    standing.ground.show(circle.plate);
    standing.ground.resize(this.#screen.height, this.#screen.ratio);
    this.#device.moved();
  }

  /** Turns the wheels to `seconds` on the scene's clock, the station kept in its circle as the eye looks about. */
  tick(seconds: number): void {
    const standing = this.#standing;
    if (standing === undefined || standing.group.parent === null) return;
    const { quaternion } = this.#device.camera;
    broughtTo(standing.group.position, this.#rest, this.#device.arrival).applyQuaternion(quaternion);
    standing.group.quaternion.copy(quaternion);
    standing.drawn.tick(this.#motion.matches ? 0 : seconds);
  }

  /** Whether one stands, for the journeys. */
  stats(): { name: string | undefined; parts: number } {
    return { name: this.#standing?.name, parts: this.#standing?.drawn.stats().parts ?? 0 };
  }

  dispose(): void {
    this.#drop();
  }
}
