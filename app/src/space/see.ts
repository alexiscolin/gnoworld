// What the camera sees, for the names and the picks (D401): where a point stands on screen, how many world units a pixel is at a
// distance of 1, and the screen's size, kept from the last resize.
import { Vector3, type PerspectiveCamera } from "three";
import type { Vec } from "./layout.ts";

export interface Seen {
  /** Where `at` stands on screen, into `out` (x, y in pixels); false off screen or behind. */
  project(at: Vec, out: Vec): boolean;
  /** World units a pixel at distance 1. */
  readonly pxK: number;
  readonly eye: Vec;
  /** The pixels a length of `size` at `at` spans on screen. */
  pixels(at: Vec, size: number): number;
}

export class See implements Seen {
  readonly screen = { width: 1, height: 1 };
  readonly eye: Vec;
  readonly #camera: PerspectiveCamera;
  readonly #point = new Vector3();

  constructor(camera: PerspectiveCamera) {
    this.#camera = camera;
    this.eye = camera.position;
  }

  get pxK(): number {
    return (2 * Math.tan((this.#camera.fov * Math.PI) / 360)) / this.screen.height;
  }

  pixels(at: Vec, size: number): number {
    const { eye } = this;
    return size / (Math.hypot(at.x - eye.x, at.y - eye.y, at.z - eye.z) * this.pxK);
  }

  project(at: Vec, out: Vec): boolean {
    const point = this.#point.set(at.x, at.y, at.z).project(this.#camera);
    if (point.z > 1 || Math.abs(point.x) > 1.2 || Math.abs(point.y) > 1.2) return false;
    out.x = ((point.x + 1) / 2) * this.screen.width;
    out.y = ((1 - point.y) / 2) * this.screen.height;
    return true;
  }
}
