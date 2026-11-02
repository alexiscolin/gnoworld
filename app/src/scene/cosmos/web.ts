// The whole cosmos on the stage (ADR-0002 §10; Alexis, 2026-11-02), a chunk of its own: past a cluster's distance a soft point for each
// world of the file and a thin line for each import between two, one draw each, gold for a world called in the last run and nothing else. A
// look writes sizes and lights; a frame brings the disc to the eye and moves the clock and the share, as the ladder's points do.
import {
  CENTRE,
  DISC_TILT,
  distanceOf,
  linksOf,
  pointTint,
  softPoint,
  spreadAt,
  toScene,
  type Point,
  type StarSystem,
} from "@gnoworld/core";
import { Group, LineSegments, Points } from "three";
import { liveLight, universeOf, type CalledWorld, type Universe } from "../live.ts";
import { cloudOf, type Cloud } from "./cloud.ts";
import type { CosmosWorld } from "./cosmosWorld.ts";
import { lineLook, pointLook } from "./webLook.ts";

/** A set to stand: its systems as the cosmos placed them, its worlds as the file holds them, and the file's time. */
export interface WebSet {
  readonly systems: readonly StarSystem[];
  readonly worlds: readonly CosmosWorld[];
  readonly written: string | undefined;
}

/** Where a look stands: the eye on the map, its lens in pixels, and how far it is from what it looks at. */
export interface WebView {
  readonly eye: Point;
  readonly focal: number;
  readonly focus: number;
}

// A live world's colour, the post's gold, in linear light, and how much brighter it stands.
const GOLD = [1, 0.62, 0.18] as const;
const GOLD_LIFT = 1.5;
// A world drawn: its system, its orbit, phase and size there, its colour with no activity, the file's word on it, and how live it was at the
// last look.
interface Held {
  readonly system: StarSystem;
  readonly orbit: number;
  readonly phase: number;
  readonly radius: number;
  readonly tint: readonly [number, number, number];
  readonly world: CalledWorld;
  live: number;
}

// A system's worlds' colour, from the mood where its star stands on the stage.
function tintAt(system: StarSystem): readonly [number, number, number] {
  const stage = { x: 0, y: 0, z: 0 };
  const tint = { red: 0, green: 0, blue: 0 };
  toScene(system.place, stage);
  pointTint(stage, tint);
  return [tint.red, tint.green, tint.blue];
}

type PointCloud = Cloud<"position" | "aCircle" | "aTint" | "aSoft">;
type LineCloud = Cloud<"position" | "aCircle" | "aTint" | "aLight">;

export class Web {
  readonly group = new Group();
  readonly #seconds = { value: 0 };
  readonly #ratio = { value: 1 };
  readonly #share = { value: 0 };
  readonly #pointLook = pointLook({ uSeconds: this.#seconds, uRatio: this.#ratio, uShare: this.#share });
  readonly #lineLook = lineLook({ uSeconds: this.#seconds, uShare: this.#share });
  readonly #soft = { size: 0, light: 0 };
  #held: Held[] = [];
  #universe: Universe = { calls: 0, newest: null, written: undefined };
  #ends: number[] = [];
  #lights = new Float32Array(0);
  #points: PointCloud | undefined;
  #lines: LineCloud | undefined;

  constructor() {
    this.group.name = "web";
    this.group.rotation.x = DISC_TILT;
    this.group.visible = false;
  }

  /** Stands a set at `now`: every world a point where its system holds it, every link of the file a line, a world called lately gold. */
  stand({ systems, worlds, written }: WebSet, now: number): void {
    this.#free();
    this.#universe = universeOf(written === undefined ? { worlds } : { worlds, updated: written });
    const tints = new Map<string, readonly [number, number, number]>();
    const places = new Map(
      systems.flatMap((system) => system.worlds.map((world) => [world.id, { system, world }] as const)),
    );
    const at = new Int32Array(worlds.length).fill(-1);
    const seen = new Map<string, number>();
    this.#held = [];
    worlds.forEach((world, from) => {
      const place = places.get(world.id);
      at[from] = seen.get(world.id) ?? -1;
      if (place === undefined || at[from] >= 0) return;
      at[from] = this.#held.length;
      seen.set(world.id, this.#held.length);
      const { orbit, phase, radius } = place.world;
      const tint = tints.get(place.system.id) ?? tintAt(place.system);
      tints.set(place.system.id, tint);
      this.#held.push({
        system: place.system,
        orbit,
        phase,
        radius,
        tint,
        world,
        live: liveLight(world, this.#universe, now),
      });
    });
    const links = linksOf(worlds);
    this.#ends = links.flatMap((end) => at[end] ?? -1).filter((end) => end >= 0);
    this.#lights = new Float32Array(this.#held.length);
    this.#build();
  }

  #build(): void {
    const points = cloudOf(this.#held.length, { position: 3, aCircle: 3, aTint: 3, aSoft: 2 });
    const lines = cloudOf(this.#ends.length, { position: 3, aCircle: 3, aTint: 3, aLight: 1 });
    this.#held.forEach(({ system, orbit, phase }, index) => {
      const { x, y, z } = system.place;
      points.attributes.position.setXYZ(index, x, y, z);
      points.attributes.aCircle.setXYZ(index, orbit, phase, system.spin);
    });
    this.#ends.forEach((end, vertex) => {
      for (const name of ["position", "aCircle"] as const)
        lines.attributes[name].setXYZ(
          vertex,
          points.attributes[name].getX(end),
          points.attributes[name].getY(end),
          points.attributes[name].getZ(end),
        );
    });
    this.#points = points;
    this.#lines = lines;
    this.#add(new Points(points.geometry, this.#pointLook));
    this.#add(new LineSegments(lines.geometry, this.#lineLook));
  }

  #add(drawn: Points | LineSegments): void {
    drawn.frustumCulled = false;
    this.group.add(drawn);
  }

  /** A look at `now`: each point's size, light and opening from where the eye stands, and its gold from how lately its world was called. */
  look({ eye, focal, focus }: WebView, now: number): void {
    const points = this.#points;
    const lines = this.#lines;
    if (points === undefined || lines === undefined) return;
    this.#held.forEach((held, index) => {
      const distance = distanceOf(held.system.place, eye);
      held.live = liveLight(held.world, this.#universe, now);
      const gold = Math.min(1, held.live);
      softPoint(held.radius, { distance, focus, focal }, this.#soft);
      this.#lights[index] = this.#soft.light * (1 + GOLD_LIFT * gold);
      points.attributes.aSoft.setXY(index, this.#soft.size, this.#lights[index] ?? 0);
      points.attributes.aCircle.setX(index, held.orbit * spreadAt(distance));
      const [red, green, blue] = held.tint.map((channel, at) => channel + ((GOLD[at] ?? 0) - channel) * gold);
      points.attributes.aTint.setXYZ(index, red ?? 0, green ?? 0, blue ?? 0);
    });
    this.#ends.forEach((end, vertex) => {
      const { aCircle, aTint } = points.attributes;
      lines.attributes.aCircle.setX(vertex, aCircle.getX(end));
      lines.attributes.aTint.setXYZ(vertex, aTint.getX(end), aTint.getY(end), aTint.getZ(end));
      lines.attributes.aLight.setX(vertex, this.#lights[end] ?? 0);
    });
    points.commit(this.#held.length);
    lines.commit(this.#ends.length);
  }

  resize(ratio: number): void {
    this.#ratio.value = ratio;
  }

  /** A frame: the disc brought to `eye` on the stage, the clock, and how much of the view is the whole cosmos's. */
  advance(eye: Point, seconds: number, share: number): void {
    this.group.position.set(CENTRE.x - eye.x, CENTRE.y - eye.y, CENTRE.z - eye.z);
    this.#seconds.value = seconds;
    this.#share.value = share;
    this.group.visible = share > 0 && this.#held.length > 0;
  }

  /** How many worlds it draws. */
  get count(): number {
    return this.#held.length;
  }

  /** What stands, for the journeys. */
  stats() {
    return {
      points: this.#held.length,
      lines: this.#ends.length / 2,
      gold: this.#held.filter(({ live }) => live > 0).length,
      share: this.#share.value,
    };
  }

  #free(): void {
    for (const child of [...this.group.children]) child.removeFromParent();
    this.#points?.geometry.dispose();
    this.#lines?.geometry.dispose();
    this.#points = undefined;
    this.#lines = undefined;
  }

  dispose(): void {
    this.#free();
    this.#pointLook.dispose();
    this.#lineLook.dispose();
    this.group.removeFromParent();
  }
}
