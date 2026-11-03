// The canvas's size and pixel ratio, and what is told of them (ADR-0002 §9). Both clear the buffer, so a change waits for the frame that
// draws it and never falls between two frames.
import { pixelRatioFor, type Tier } from "@gnoworld/core";
import type { PerspectiveCamera, WebGLRenderer } from "three";

// The home's lens is core's FIELD_OF_VIEW, which the view at rest is composed for (7d9): a number here, for a value of core would bring its
// barrel into the scene's chunk; the lens test ties the two.
export const LENS = { fieldOfView: 50, home: 42.47122885453438, near: 0.1, far: 2000 } as const;

interface Sized {
  resize(width: number, height: number, ratio: number): void;
}

export interface ViewportParts {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGLRenderer;
  readonly camera: PerspectiveCamera;
  readonly space: Sized & { detail(tier: Tier): void };
  readonly earth: Sized;
  /** The parts behind chunks of their own. */
  readonly parts: Sized;
  readonly touch: boolean;
  readonly tier: () => Tier;
  /** The size is stale: a frame is owed. */
  readonly owed: () => void;
}

export class Viewport {
  readonly #parts: ViewportParts;
  #stale = false;
  #cosmos = false;
  #viewed: number | undefined;
  #width = 0;
  #height = 0;

  constructor(parts: ViewportParts) {
    this.#parts = parts;
  }

  /** Applies a change that is waiting, on the frame that draws it. */
  settle(): void {
    if (this.#stale) this.apply();
  }

  apply(): void {
    const { canvas, renderer, camera, space, earth, parts, touch, tier } = this.#parts;
    this.#stale = false;
    const ratio = pixelRatioFor(devicePixelRatio, touch, tier());
    renderer.setPixelRatio(ratio);
    space.detail(tier());
    const { clientWidth: width, clientHeight: height } = canvas;
    if (width === 0 || height === 0) return;
    this.#width = width;
    this.#height = height;
    renderer.setSize(width, height, false);
    space.resize(width, height, ratio);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    earth.resize(width, height, renderer.getPixelRatio());
    parts.resize(width, height, renderer.getPixelRatio());
  }

  /** Looks at the cosmos through the lens a view of it asked, the home's where none, or, with no cosmos, through the scene's own. */
  cosmos(shown: boolean): void {
    this.#cosmos = shown;
    if (!shown) this.#viewed = undefined;
    this.lens(shown ? (this.#viewed ?? LENS.home) : LENS.fieldOfView);
  }

  /** The eye came to a view of the cosmos seen through `degrees`, a Plan's own (7v's design review, F4470), or the home's with none: kept
   * while the cosmos shows, as its words come again each minute. */
  view(degrees: number | undefined): void {
    this.#viewed = degrees;
    if (this.#cosmos) this.lens(degrees ?? LENS.home);
  }

  /** Looks through `degrees` up and down: each part sizes itself for it on the frame that draws it. */
  lens(degrees: number): void {
    if (this.#parts.camera.fov === degrees) return;
    this.#parts.camera.fov = degrees;
    this.changed();
  }

  readonly changed = (): void => {
    this.#stale = true;
    this.#parts.owed();
  };

  readonly resized = (): void => {
    const { clientWidth: width, clientHeight: height } = this.#parts.canvas;
    if (width !== 0 && height !== 0 && (width !== this.#width || height !== this.#height)) this.changed();
  };
}
