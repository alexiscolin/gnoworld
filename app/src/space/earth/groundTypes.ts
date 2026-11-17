// What the page's signs and the ground know of each other (ground.ts): a mark on the ground, the ground the page reaches, the eye.
import type { LatLon } from "@gnoworld/core/bubbles";
import type { Vector3 } from "three";
import type { Vec } from "../layout.ts";

export type { LatLon };

export interface GroundMark extends LatLon {
  /** Where it stands in the page's pixels, and whether the eye sees it clear of the limb. */
  readonly place: (x: number, y: number, front: boolean) => void;
  /** A bubble's: the page's x it must stand left of to be read (the dock's edge); the newest turns the Earth to it. */
  readonly keep?: number | undefined;
  /** Where its country should stand when it is brought into view: the free area's point it is kept at (signMarks.ts). */
  readonly aim?: { readonly x: number; readonly y: number } | undefined;
  /** A world's bubble: the page's point it must stand right of and under (the plate's edge, the header's), or the newest turns the world. */
  readonly from?: { readonly x: number; readonly y: number } | undefined;
  /** When its message was said, in milliseconds: one said before the planet's arrival never turns it; none, said after. */
  readonly sent?: number | undefined;
  /** Called once, when the arrival has calmed: the bubble's ping starts then, never before. */
  readonly calm?: (() => void) | undefined;
}

/** How a planet's axis stands: its lean and tilt, as its group is turned (planet.ts). */
export interface Axis {
  readonly lean: number;
  readonly tilt: number;
}

/** What the page has of the Earth under it. */
export interface Ground {
  /** The marks to keep placed, in place of the last. */
  setMarks(marks: readonly GroundMark[]): void;
  /** The ground that faces the eye; none while no Earth stands. */
  facing(): LatLon | undefined;
}

/** The eye that sees the Earth: where it stands, and where a point stands on screen (false off it). */
export interface Eye {
  readonly eye: Vec;
  project(at: Vec, out: Vec): boolean;
}

/** A colony's hull, which its marks stand on in place of a ground (colony/colony.ts): the point and normal nearest a mark's spot, in the
 * frame a ground direction is in, and whether the colony stands between a point and the eye. */
export interface Hull {
  anchorFor(ground: Vector3, at: Vector3, out: Vector3): void;
  blocks(point: Vec, eye: Vec): boolean;
  /** The share of its planet's radius it stands at now: less on its page, framed close. */
  readonly scale: number;
}
