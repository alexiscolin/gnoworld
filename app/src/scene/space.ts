// The scenery (ADR-0002 §10, "Two layers"): generative art computed from a position, tied to no data, behind everything real. The camera
// never leaves the origin, so what is drawn here comes to it (slice-7 §5): `follow` takes the eye in doubles, and each part keeps only
// what remains of it.
import { MOTES, SHELLS, type Point, type Tier } from "@gnoworld/core";
import type { Camera, Scene as Stage, WebGLRenderer } from "three";
import type { Disposer } from "./disposer.ts";
import { Field } from "./field.ts";
import { Sky } from "./sky.ts";

export class Space {
  readonly #sky: Sky;
  readonly #fields: readonly Field[];

  constructor(stage: Stage, owner: Disposer) {
    this.#sky = new Sky(stage, owner);
    this.#fields = [...SHELLS, MOTES].map((shell) => new Field(stage, owner, shell));
  }

  /** Puts the scenery around the eye, `seconds` into its wind. Writes only what entered the view. */
  follow(eye: Point, seconds: number): void {
    this.#sky.follow(eye, seconds);
    for (let at = 0; at < this.#fields.length; at += 1) this.#fields[at]?.follow(eye, seconds);
  }

  /** A context came back with nothing in it: the sky's picture is owed. */
  redraw(): void {
    this.#sky.redraw();
  }

  /** Draws the sky's picture, ahead of the stage, if the view has moved. */
  march(renderer: WebGLRenderer, camera: Camera): void {
    this.#sky.march(renderer, camera);
  }

  /** The canvas's size in CSS pixels, and the pixel ratio it draws at. */
  resize(width: number, height: number, ratio: number): void {
    this.#sky.resize(width * ratio, height * ratio);
    for (let at = 0; at < this.#fields.length; at += 1) this.#fields[at]?.resize(ratio);
  }

  detail(tier: Tier): void {
    this.#sky.detail(tier);
  }
}
