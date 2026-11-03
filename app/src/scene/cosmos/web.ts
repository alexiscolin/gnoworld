// The whole cosmos on the stage (ADR-0002 §10; Alexis, 2026-11-02), a chunk of its own: past a cluster's distance a soft point for each
// world of the file and a thin line for each import between two, one draw each, gold for a world called in the last run and nothing else. A
// look writes sizes and lights; a frame brings the disc to the eye and moves the clock and the share, as the ladder's points do.
import {
  auroraOf,
  CENTRE,
  DISC_TILT,
  distanceOf,
  linksOf,
  orbitTime,
  softPoint,
  type Point,
  type StarSystem,
} from "@gnoworld/core";
import { BufferGeometry, Group, LineSegments, Points } from "three";
import { heightAt, universeOf, type Universe } from "../live.ts";
import { cloudOf, type Cloud } from "./cloud.ts";
import type { CosmosWorld } from "./cosmosWorld.ts";
import { calmFor, endsOf, heldOf, type Held } from "./webHeld.ts";
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

// A live world's colour, the post's gold, in linear light, and how much brighter and larger it stands.
const GOLD = [1, 0.62, 0.18] as const;
const GOLD_LIFT = 1.5;
const GOLD_GROW = 0.5;
// How many points and lines a view holds whole: past that, each adds less, as the square root of how many more, so a crowd keeps its dark.
const POINTS_CALM = 2_000;
const LINES_CALM = 200;
type PointCloud = Cloud<"position" | "aCircle" | "aPlane" | "aTint" | "aSoft">;

export class Web {
  readonly group = new Group();
  readonly #seconds = { value: 0 };
  readonly #ratio = { value: 1 };
  readonly #share = { value: 0 };
  readonly #pointCalm = { value: 1 };
  readonly #lineCalm = { value: 1 };
  readonly #pointLook = pointLook({
    uSeconds: this.#seconds,
    uRatio: this.#ratio,
    uShare: this.#share,
    uCalm: this.#pointCalm,
  });
  readonly #lineLook = lineLook({ uSeconds: this.#seconds, uShare: this.#share, uCalm: this.#lineCalm });
  readonly #soft = { size: 0, light: 0 };
  #held: Held[] = [];
  #universe: Universe = { calls: 0, newest: null, written: undefined };
  #ends: number[] = [];
  #points: PointCloud | undefined;
  #lines: BufferGeometry | undefined;

  constructor() {
    this.group.name = "web";
    this.group.rotation.x = DISC_TILT;
    this.group.visible = false;
  }

  /** Stands a set at `now`: every world a point where its system holds it, every link of the file a line, a world called lately gold. */
  stand({ systems, worlds, written }: WebSet, now: number): void {
    this.#free();
    this.#universe = universeOf(written === undefined ? { worlds } : { worlds, updated: written });
    const { held, at } = heldOf(systems, worlds);
    this.#held = held;
    this.#ends = endsOf(linksOf(worlds), at);
    this.#pointCalm.value = calmFor(this.#held.length, POINTS_CALM);
    this.#lineCalm.value = calmFor(this.#ends.length / 2, LINES_CALM);
    this.#build();
    this.#age(now);
  }

  // How live each world is at `now`: the chain's height read once, each world's calls as the stand read them.
  #age(now: number): void {
    const height = heightAt(this.#universe, now);
    for (const held of this.#held) held.live = auroraOf(held.called, height, this.#universe.calls);
  }

  // The points hold every world's place, written once; the lines read the same buffers through an index, so a look writes nothing of theirs.
  #build(): void {
    const points = cloudOf(this.#held.length, { position: 3, aCircle: 3, aPlane: 2, aTint: 3, aSoft: 2 });
    this.#held.forEach(({ system, orbit, phase }, index) => {
      const { x, y, z } = system.place;
      points.attributes.position.setXYZ(index, x, y, z);
      points.attributes.aCircle.setXYZ(index, orbit, phase, system.spin);
      points.attributes.aPlane.setXY(index, system.node, system.tilt);
    });
    points.geometry.setDrawRange(0, this.#held.length);
    const lines = new BufferGeometry();
    for (const [name, attribute] of Object.entries(points.attributes)) lines.setAttribute(name, attribute);
    lines.setIndex(this.#ends);
    lines.setDrawRange(0, this.#ends.length);
    this.#points = points;
    this.#lines = lines;
    this.#add(new Points(points.geometry, this.#pointLook));
    this.#add(new LineSegments(lines, this.#lineLook));
  }

  #add(drawn: Points | LineSegments): void {
    drawn.frustumCulled = false;
    this.group.add(drawn);
  }

  /** A look at `now`: each point's size and light from where the eye stands, and its gold from how lately its world was called. It
   * uploads those and nothing else. */
  look({ eye, focal, focus }: WebView, now: number): void {
    const points = this.#points;
    if (points === undefined) return;
    this.#age(now);
    const { aSoft, aTint } = points.attributes;
    this.#held.forEach((held, index) => {
      const gold = Math.min(1, held.live);
      softPoint(held.radius, { distance: distanceOf(held.system.place, eye), focus, focal }, this.#soft);
      aSoft.setXY(
        index,
        this.#soft.size * (1 + GOLD_GROW * gold),
        this.#soft.light * held.calm * (1 + GOLD_LIFT * gold),
      );
      // No array made a world: a look at 20,000 worlds runs on the dive's frames (the review of 7d7).
      const { tint } = held;
      aTint.setXYZ(
        index,
        tint[0] + (GOLD[0] - tint[0]) * gold,
        tint[1] + (GOLD[1] - tint[1]) * gold,
        tint[2] + (GOLD[2] - tint[2]) * gold,
      );
    });
    aSoft.needsUpdate = true;
    aTint.needsUpdate = true;
  }

  resize(ratio: number): void {
    this.#ratio.value = ratio;
  }

  /** A frame: the disc brought to `eye` on the stage, the clock every world turns by, and how much of the view is the whole cosmos's. */
  advance(eye: Point, seconds: number, share: number): void {
    this.group.position.set(CENTRE.x - eye.x, CENTRE.y - eye.y, CENTRE.z - eye.z);
    this.#seconds.value = orbitTime(seconds);
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
    this.#lines?.dispose();
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
