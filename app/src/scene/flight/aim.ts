// The star a reader aims at (7g, "the jump to a star you aim at"; slice 7 §9, question 12): a click on space, and not on the page's words or
// controls, picks the star nearest it on screen, within reach of a fingertip; no map is needed. And what the panel calls a star: the name
// its namespace gives, or its first world's, never an address (core's labelName, as the labels name them).
import { labelName, type Point, type StarSystem } from "@gnoworld/core";
import { Vector3, type PerspectiveCamera } from "three";
import type { CosmosSight } from "./goal.ts";

// Within this many pixels of a star's centre, a click aims at it.
const REACH = 24;
// What a click aims through, and so at nothing in space: the page's controls, its fields and its words.
const NOT_SPACE =
  "a, button, input, select, textarea, summary, label, dialog, [role], [contenteditable]:not([contenteditable='false']), p, h1, h2, h3, h4, h5, h6, li, dt, dd, section, aside, header, nav, form";

const seat = new Vector3();

/** Whether a click on `target` falls on space. */
export const onSpace = (target: EventTarget | null): boolean =>
  !(target instanceof Element) || target.closest(NOT_SPACE) === null;

/** The star of `sight` nearest the window's point `x`, `y`, within reach, ahead of the eye through `camera`; none, if none is. The canvas
 * fills the window. */
export function starAt(
  sight: CosmosSight,
  camera: PerspectiveCamera,
  { x, y }: { x: number; y: number },
): StarSystem | undefined {
  let nearest: StarSystem | undefined;
  let best = REACH;
  for (const system of sight.systems()) {
    sight.toScene(system.place, seat);
    seat.set(seat.x - sight.eye.x, seat.y - sight.eye.y, seat.z - sight.eye.z);
    // A star the suns leave unlit, past their reach, is empty space to a click.
    const lit = seat.length() < sight.lit;
    seat.applyMatrix4(camera.matrixWorldInverse);
    const ahead = seat.z < 0;
    seat.applyMatrix4(camera.projectionMatrix);
    const off = Math.hypot(((seat.x + 1) * innerWidth) / 2 - x, ((1 - seat.y) * innerHeight) / 2 - y);
    if (ahead && lit && off <= best) {
      best = off;
      nearest = system;
    }
  }
  return nearest;
}

/** What the panel calls `system`: its namespace's name, else its first world's, else a plain word. */
export const starName = ({ id, worlds }: StarSystem): string =>
  labelName(id) ?? worlds.map((world) => labelName(world.id)).find((name) => name !== null) ?? "Star";

/** Whether `point` is a place. */
export const isPlace = ({ x, y, z }: Point): boolean => Number.isFinite(x + y + z);
