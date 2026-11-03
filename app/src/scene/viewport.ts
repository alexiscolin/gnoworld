// The canvas's size and pixel ratio, and what is told of them (ADR-0002 §9). Both clear the buffer, so a change waits for the frame that
// draws it and never falls between two frames.
import { pixelRatioFor, type Tier } from "@gnoworld/core";
import type { PerspectiveCamera, WebGLRenderer } from "three";

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

  /** Looks through `degrees` up and down, the home's lens or the scene's: each part sizes itself for it on the frame that draws it. */
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
