// The Earth's view (part 7x2; Alexis, 2026-11-04): round the Earth the stations of the team's file, each built from its name, the twelve
// largest as bodies and the rest as the belt's lights, and the real planets as still scenery for depth; from above, the stations' orbits
// and, over them, their names and the caption. In a chunk of its own, asked once the cosmos shows, so a phone loads none of it before "View
// in space"; its maps come after. What leaves the frame leaves it: nothing here hides as the eye moves, the orbits and the caption fade.
import {
  CENTRE,
  clearOf,
  EARTH_PLACE,
  earthEye,
  sceneryOf,
  smoothstep,
  stationOf,
  stationsRound,
  toMap,
  toScene,
  type Point,
} from "@gnoworld/core";
import { Group, Vector3, type Material } from "three";
import projects from "../../../data/earthOrbit.json" with { type: "json" };
import type { EarthDevice } from "../earth/device.ts";
import { SMALL_RING } from "../earth/orbit.ts";
import { beltOf } from "./belt.ts";
import { StationNames, type Named, type Sight, type Spot } from "./names.ts";
import { lightsOf } from "./shapes.ts";
import { TextBox } from "./textBox.ts";
import { offTheBox } from "../offTheBox.ts";
import { fadeOrbits, orbitsOf } from "./orbits.ts";
import { SceneryDrawn } from "./scenery.ts";
import { StationsDrawn } from "./stations.ts";

// The eye's angle over the disc, in radians, where the orbits start to show and where they are whole: the view at rest stands at 0.26, a
// mouse's lean keeps it under 0.4, the top view at 1.25.
const ORBITS_FROM = 0.6;
const ORBITS_WHOLE = 1.1;
// How far from the Earth, in units, the names show, and the belt's lights fade out: a station's body is then under a pixel.
const NAMES_NEAR = 90;
const BELT = [150, 400] as const;
// A station's name stands over it from this share of its reach.
const NAME_REACH = 0.8;

type Belt = ReturnType<typeof beltOf>;
/** A project round the Earth as the team's file gives it (earthOrbit.json): its name, where it leads, its station's size. */
export type Project = Named & { readonly size?: number | undefined };
type Device = Pick<EarthDevice, "renderer" | "base" | "moved" | "camera">;
/** What it stands: the team's `projects`, their names in `document` over a canvas of `sight`; the lab may leave the `scenery` out. */
interface Standing {
  readonly projects: readonly Project[];
  readonly document: Document;
  readonly sight: () => Sight;
  readonly scenery?: boolean;
}

export class EarthView {
  /** Where it all stands, at the Earth, its place on the stage less the eye's. */
  readonly group = new Group();
  readonly #device: Device;
  readonly #projects: readonly Project[];
  readonly #withScenery: boolean;
  readonly #names: StationNames;
  readonly #earth = { x: 0, y: 0, z: 0 };
  readonly #map = { x: 0, y: 0, z: 0 };
  readonly #at = new Vector3();
  #stations: StationsDrawn | undefined;
  #scenery: SceneryDrawn | undefined;
  #belt: Belt | undefined;
  #orbits: ReturnType<typeof orbitsOf> | undefined;
  // Each close station's place round the Earth on the stage, and its reach; where each stands on the screen, written each frame.
  #close: { at: Vector3; radius: number }[] = [];
  #spots: Spot[] = [];
  #loading = new AbortController();
  readonly #sight: () => Sight;
  readonly #text = new TextBox();

  /** On `device`, through its camera, what `standing` says. */
  constructor(device: Device, { projects, document, sight, scenery = true }: Standing) {
    this.#device = device;
    this.#sight = sight;
    this.#projects = projects;
    this.#withScenery = scenery;
    this.#names = new StationNames(document);
    toScene(EARTH_PLACE, this.#earth);
  }

  /** Stands the stations, the belt and the orbits at once, then the scenery once its maps came; again after a drop. A map that does not
   * come leaves the scenery out. */
  stand(): void {
    if (this.#stations !== undefined) return;
    const projects = this.#projects;
    const round = stationsRound(
      projects.map(({ name, size }) => ({ seed: name, size: size ?? 0 })),
      SMALL_RING,
    );
    const place = (point: Point) => {
      const at = { x: 0, y: 0, z: 0 };
      toScene(point, at);
      return new Vector3(at.x - this.#earth.x, at.y - this.#earth.y, at.z - this.#earth.z);
    };
    this.#close = round.close.map((placed) => ({ at: place(placed.place), radius: placed.radius }));
    this.#spots = round.close.map(() => ({ x: 0, y: 0, radius: 0, shown: false }));
    const stations = new StationsDrawn();
    stations.stand(
      round.close.map((placed, at) => ({
        station: stationOf(placed.seed, placed.size),
        at: this.#close[at]?.at ?? place(placed.place),
        radius: placed.radius,
      })),
    );
    const belt = beltOf(
      new Float32Array(round.belt.flatMap((placed) => place(placed.place).toArray())),
      new Float32Array(round.belt.map(({ radius }) => radius * 0.6)),
    );
    const orbits = orbitsOf(round.close, this.#earth);
    offTheBox(orbits.material, () => this.#text.of(this.#sight().box));
    const named = new Map(projects.map((project) => [project.name, project]));
    this.#names.name(round.close.flatMap(({ seed }) => named.get(seed) ?? []));
    [this.#stations, this.#belt, this.#orbits] = [stations, belt, orbits];
    const toStar = new Vector3(
      CENTRE.x - this.#earth.x,
      CENTRE.y - this.#earth.y,
      CENTRE.z - this.#earth.z,
    ).normalize();
    this.group.add(stations.group, belt, orbits, ...lightsOf(toStar));
    if (this.#withScenery) this.#standScenery(this.#loading.signal);
    this.#device.moved();
  }

  // The scenery's planets once their maps came; a map that does not come leaves them out.
  #standScenery(signal: AbortSignal): void {
    const scenery = new SceneryDrawn();
    const { renderer, base } = this.#device;
    const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    scenery.stand(sceneryOf(), { eye: earthEye(), base, anisotropy, signal }).then(
      () => {
        if (signal.aborted) {
          scenery.dispose();
          return;
        }
        this.#scenery = scenery;
        this.group.add(scenery.group);
        this.#device.moved();
      },
      () => {
        scenery.dispose();
      },
    );
  }

  /** A frame: the group at the Earth from `eye`, on the stage; the wheels `seconds` on the worlds' clock, which reduced motion holds; the
   * orbits, the belt, the names and the caption as far as the eye stands, `shown` as the Earth is. */
  tick(eye: Point, seconds: number, shown: boolean): void {
    const { x, y, z } = this.#earth;
    this.group.position.set(x - eye.x, y - eye.y, z - eye.z);
    this.#stations?.tick(seconds);
    toMap(eye, this.#map);
    const up = this.#map.y - EARTH_PLACE.y;
    const away = Math.hypot(this.#map.x - EARTH_PLACE.x, up, this.#map.z - EARTH_PLACE.z);
    const top = smoothstep(ORBITS_FROM, ORBITS_WHOLE, Math.asin(Math.min(1, Math.max(-1, up / away))));
    const near = away < NAMES_NEAR;
    if (this.#orbits !== undefined) fadeOrbits(this.#orbits, near ? top : 0);
    const fade = this.#belt?.material.uniforms["fade"];
    if (fade !== undefined) fade.value = 1 - smoothstep(BELT[0], BELT[1], away);
    this.#names.show(shown && near);
    if (shown && near) this.#placeNames(1 - top);
  }

  // Each close station's name over it on the screen, none behind the eye or off the screen; the caption at `caption` of its strength.
  #placeNames(caption: number): void {
    const { camera } = this.#device;
    const { width, height, focal, box: given } = this.#sight();
    const box = this.#text.of(given);
    this.group.updateMatrixWorld();
    for (let index = 0; index < this.#close.length; index += 1) {
      const close = this.#close[index];
      const spot = this.#spots[index];
      if (close === undefined || spot === undefined) continue;
      this.#at.copy(close.at).applyMatrix4(this.group.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      const depth = -this.#at.z;
      this.#at.applyMatrix4(camera.projectionMatrix);
      spot.x = ((this.#at.x + 1) / 2) * width;
      spot.y = ((1 - this.#at.y) / 2) * height;
      spot.radius = (close.radius * focal) / Math.max(depth, close.radius);
      spot.shown = depth > 0 && spot.x >= 0 && spot.x <= width && spot.y >= 0 && spot.y <= height;
      this.#stations?.room(index, box === undefined ? 1 : clearOf(spot, box));
      spot.radius *= NAME_REACH;
    }
    this.#names.place(this.#spots, caption, { width, box });
  }

  /** Keeps what `material` draws off the page's text, as its own orbits: the Earth's ring, which the cosmos's Home draws. */
  keepOff(material: Material): void {
    offTheBox(material, () => this.#text.of(this.#sight().box));
  }

  /** Its names off the page, as the cosmos goes. */
  hide(): void {
    this.#names.show(false);
  }

  /** What stands, for the journeys: the stations as bodies and as lights, their parts and draws, and the scenery's planets. */
  stats() {
    return {
      close: this.#close.length,
      belt: this.#belt?.geometry.drawRange.count ?? 0,
      ...(this.#stations?.stats() ?? { parts: 0, draws: 0 }),
      scenery: this.#scenery?.group.children.length ?? 0,
      orbits: this.#orbits?.visible ?? false,
    };
  }

  /** Frees it all, and the maps on their way; it may stand again. */
  drop(): void {
    this.#loading.abort();
    this.#loading = new AbortController();
    this.group.clear();
    this.#stations?.dispose();
    this.#scenery?.dispose();
    this.#belt?.geometry.dispose();
    this.#belt?.material.dispose();
    this.#orbits?.geometry.dispose();
    this.#orbits?.material.dispose();
    [this.#stations, this.#scenery, this.#belt, this.#orbits] = [undefined, undefined, undefined, undefined];
    this.#close = [];
    this.#spots = [];
    this.#names.name([]);
  }

  dispose(): void {
    this.drop();
    this.#names.dispose();
    this.group.removeFromParent();
  }
}

/** The site's Earth view, on the page's document: the stations of the team's file, app/data/earthOrbit.json, checked when the app builds. */
export const siteEarthView = (device: Device, sight: () => Sight): EarthView =>
  new EarthView(device, { projects, document, sight });
