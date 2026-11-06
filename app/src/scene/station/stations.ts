// The stations drawn (part 7x): every part of every station standing, one instanced draw a kind of part, so 1 or 1,000 stations cost the
// same eight draws. A station stands at its place round the Earth, its spine turned its way, and its wheels turn round it; under reduced
// motion nothing turns. Places are round the group's origin, which the caller stands where the Earth is.
import { textHash, unitOf, type Point } from "@gnoworld/core";
import { PART_KINDS, type Part, type PartKind, type Station } from "@gnoworld/core";
import { Color, DynamicDrawUsage, Group, InstancedMesh, Matrix4, Quaternion, SRGBColorSpace, Vector3 } from "three";
import { coveringsOf, finishColour, LAMP_COLOURS, shapesOf } from "./shapes.ts";

/** A station standing: what it is, where round the Earth, and its reach there, in world units. */
export interface Standing {
  readonly station: Station;
  readonly at: Point;
  readonly radius: number;
}

const Y = new Vector3(0, 1, 0);
// A station's cells: deep blue, slate, teal, bronze or graphite, one for all its panels.
const CELLS = [0x3a5590, 0x50607a, 0x2f6a72, 0x8a6a3c, 0x3c3f48] as const;

// A part's own turn: its axis up, its face where it looks, square to it.
function basisOf({ axis, face }: Part, out: Matrix4): Matrix4 {
  const up = new Vector3(axis.x, axis.y, axis.z).normalize();
  const looking = face === undefined ? new Vector3(up.y, up.z, up.x) : new Vector3(face.x, face.y, face.z);
  const through = looking.addScaledVector(up, -looking.dot(up)).normalize();
  if (through.lengthSq() < 0.5) through.set(up.z, up.x, up.y).addScaledVector(up, -up.z).normalize();
  const across = new Vector3().crossVectors(up, through);
  return out.makeBasis(across, up, through);
}

// A part's colour: a lamp's own, a station's cells' one colour, or its finish's, tinted by the station.
function colourOf(seed: string, { part, at, tint }: { part: Part; at: number; tint: number }, out: Color): Color {
  if (part.finish === "lamp")
    return out.setHex(LAMP_COLOURS[textHash(`${seed} ${String(at)}`) % LAMP_COLOURS.length] ?? 0xffffff);
  if (part.finish === "cells")
    return out.setHex(CELLS[textHash(`cells ${seed}`) % CELLS.length] ?? 0x3a5590, SRGBColorSpace);
  return finishColour(part.finish, out).multiplyScalar(tint);
}

// Each part's own matrix, from the station's frame, built once: a frame multiplies it in.
const ownOf = (part: Part): Matrix4 =>
  basisOf(part, new Matrix4())
    .setPosition(part.at.x, part.at.y, part.at.z)
    .multiply(new Matrix4().makeScale(part.size.x, part.size.y, part.size.z));

interface Placed {
  readonly kind: PartKind;
  /** The station's frame and the part's own matrix, built once; how fast it turns with the wheel, 0 where it does not. */
  readonly frame: Matrix4;
  readonly own: Matrix4;
  readonly spin: number;
  /** Its instance in its kind's draw. */
  index: number;
  mesh: InstancedMesh | undefined;
}

// A station's pose: at its place, its spine turned its way and turned round it, its reach; its frame, scaled to the reach and to the share
// of it the page's text leaves (`room`).
interface Pose {
  readonly at: Vector3;
  readonly turn: Quaternion;
  readonly radius: number;
  readonly frame: Matrix4;
  room: number;
}

function standingOf({ station, at, radius }: Standing): Pose {
  const turn = new Quaternion().setFromUnitVectors(Y, new Vector3(station.spine.x, station.spine.y, station.spine.z));
  turn.multiply(new Quaternion().setFromAxisAngle(Y, station.turn));
  const made = { at: new Vector3(at.x, at.y, at.z), turn, radius, frame: new Matrix4(), room: 1 };
  made.frame.compose(made.at, turn, new Vector3(radius, radius, radius));
  return made;
}

export class StationsDrawn {
  readonly group = new Group();
  readonly #shapes = shapesOf();
  readonly #coverings = coveringsOf();
  #meshes: InstancedMesh[] = [];
  #placed: Placed[] = [];
  #poses: Pose[] = [];
  readonly #scale = new Vector3();
  readonly #wheel = new Matrix4();
  readonly #matrix = new Matrix4();

  /** Stands `list`, in place of what stood. */
  stand(list: readonly Standing[]): void {
    this.#clear();
    this.#poses = list.map(standingOf);
    this.#placed = list.flatMap((standing, at) => {
      const frame = this.#poses[at]?.frame ?? new Matrix4();
      return standing.station.parts.map((part) => ({
        kind: part.kind,
        frame,
        own: ownOf(part),
        spin: part.wheel ? standing.station.spin : 0,
        index: 0,
        mesh: undefined,
      }));
    });
    for (const kind of PART_KINDS) this.#mesh(kind, list);
    this.tick(0);
  }

  #mesh(kind: PartKind, list: readonly Standing[]): void {
    const mine = this.#placed.filter((placed) => placed.kind === kind);
    if (mine.length === 0) return;
    const mesh = new InstancedMesh(this.#shapes[kind], this.#coverings.materials[kind], mine.length);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    mine.forEach((placed, index) => {
      placed.index = index;
      placed.mesh = mesh;
    });
    const colour = new Color();
    let index = 0;
    for (const { station } of list) {
      const tint = 0.88 + 0.2 * unitOf(textHash(`tint ${station.seed}`));
      station.parts.forEach((part, at) => {
        if (part.kind !== kind) return;
        mesh.setColorAt(index, colourOf(station.seed, { part, at, tint }, colour));
        index += 1;
      });
    }
    this.#meshes.push(mesh);
    this.group.add(mesh);
  }

  /** Station `at` drawn at `room` of its reach, 0 to 1: what the page's text leaves of it, as a body's (cosmos/bodies.ts). */
  room(at: number, room: number): void {
    const pose = this.#poses[at];
    if (pose === undefined || pose.room === room) return;
    pose.room = room;
    const reach = pose.radius * room;
    pose.frame.compose(pose.at, pose.turn, this.#scale.set(reach, reach, reach));
  }

  /** The stations `seconds` on: each wheel turned round its spine. */
  tick(seconds: number): void {
    for (let at = 0; at < this.#placed.length; at += 1) {
      const placed = this.#placed[at];
      if (placed?.mesh === undefined) continue;
      this.#wheel.makeRotationY(placed.spin * seconds);
      this.#matrix.multiplyMatrices(placed.frame, this.#wheel).multiply(placed.own);
      placed.mesh.setMatrixAt(placed.index, this.#matrix);
    }
    for (let at = 0; at < this.#meshes.length; at += 1) {
      const mesh = this.#meshes[at];
      if (mesh !== undefined) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** How many parts and draws stand. */
  stats(): { parts: number; draws: number } {
    return { parts: this.#placed.length, draws: this.#meshes.length };
  }

  #clear(): void {
    for (const mesh of this.#meshes) {
      mesh.removeFromParent();
      mesh.dispose();
    }
    this.#meshes = [];
  }

  dispose(): void {
    this.#clear();
    for (const shape of Object.values(this.#shapes)) shape.dispose();
    for (const material of Object.values(this.#coverings.materials)) material.dispose();
    this.#coverings.grid.dispose();
  }
}
