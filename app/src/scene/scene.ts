// The scene (docs/ARCHITECTURE.md, "The scene"), behind its lazy chunk: the renderer, its one loop, the Auto probe and what stops them.
// It draws through one owner, and imports no React: the universe feature mounts it.
import { judgeFrames, pixelRatioFor, PROBE_FRAMES, type ProbeVerdict, type Tier } from "@gnoworld/core";
import { Color, PerspectiveCamera, Scene as Stage, type WebGLRenderer } from "three";
import { Disposer } from "./disposer.ts";
import { browserClock, FrameLoop, type FrameClock } from "./loop.ts";
import { createRenderer } from "./renderer.ts";
import { MOTION, watchPage, watchScreen } from "./watch.ts";

const TOUCH = "(pointer: coarse)";
// The frames' deep black, read off the far corners of f0004, f0005 and f0017. The stage's, for a restored context resets the clear colour.
const DEEP_BLACK = 0x010101;
const FIELD_OF_VIEW = 50;
const NEAR = 0.1;
const FAR = 2000;

export interface SceneOptions {
  readonly canvas: HTMLCanvasElement;
  /** The tier this device was found at before, if any. */
  readonly remembered: Tier | undefined;
  readonly remember: (tier: Tier) => void;
  /** The context went (true), or came back (false). */
  readonly onLost: (lost: boolean) => void;
}

export interface Scene {
  cover(covered: boolean): void;
  dispose(): void;
  stats(): SceneStats;
}

interface SceneStats {
  readonly frames: number;
  readonly tier: Tier;
  readonly ratio: number;
  readonly probing: boolean;
  readonly calls: number;
  readonly geometries: number;
  readonly textures: number;
}

class LiveScene implements Scene {
  readonly #owner = new Disposer();
  readonly #options: SceneOptions;
  readonly #touch = matchMedia(TOUCH).matches;
  readonly #renderer: WebGLRenderer;
  readonly #stage = new Stage();
  readonly #camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, NEAR, FAR);
  readonly #loop: FrameLoop;
  readonly #samples = new Float32Array(PROBE_FRAMES);
  #sampled = 0;
  #tier: Tier;
  #probing: boolean;
  #covered = false;
  #lost = false;
  #frames = 0;
  #width = 0;
  #height = 0;
  #viewportStale = false;

  constructor(options: SceneOptions, clock: FrameClock) {
    const { canvas, remembered } = options;
    this.#options = options;
    this.#tier = remembered ?? "high";
    this.#probing = remembered === undefined && !matchMedia(MOTION).matches;
    this.#renderer = createRenderer(canvas, !this.#touch && this.#tier === "high");
    this.#stage.background = new Color(DEEP_BLACK);
    this.#owner.add({
      dispose: () => {
        this.#renderer.forceContextLoss();
        this.#renderer.dispose();
      },
    });
    this.#applyViewport();
    this.#loop = new FrameLoop(clock, this.#draw);
    this.#owner.add({
      dispose: () => {
        this.#loop.stop();
      },
    });
    this.#loop.set({ busy: this.#probing });
    this.#watch(canvas);
  }

  #watch(canvas: HTMLCanvasElement): void {
    const { signal } = this.#owner;
    watchPage(this.#loop, signal);
    watchScreen(this.#viewportChanged, signal);
    const observer = new ResizeObserver(this.#resized);
    observer.observe(canvas);
    this.#owner.add({
      dispose: () => {
        observer.disconnect();
      },
    });
    const lost = (now: boolean) => () => {
      this.#lost = now;
      this.#options.onLost(now);
      this.#stopOrGo();
    };
    canvas.addEventListener("webglcontextlost", lost(true), { signal });
    canvas.addEventListener("webglcontextrestored", lost(false), { signal });
  }

  readonly #draw = (delta: number): void => {
    if (this.#viewportStale) this.#applyViewport();
    this.#renderer.render(this.#stage, this.#camera);
    this.#frames += 1;
    if (this.#probing && delta > 0) this.#sample(delta);
  };

  #sample(delta: number): void {
    this.#samples[this.#sampled] = delta;
    this.#sampled += 1;
    const verdict = judgeFrames(this.#samples, this.#sampled);
    if (verdict !== "pending") this.#judged(verdict);
  }

  #judged(verdict: Exclude<ProbeVerdict, "pending">): void {
    this.#probing = false;
    this.#loop.set({ busy: false });
    if (verdict === "keep") return;
    this.#tier = "low";
    this.#viewportChanged();
    if (verdict === "low") this.#options.remember("low");
  }

  // Both clear the buffer, so they wait for the frame that draws it, and never fall between two frames.
  #applyViewport(): void {
    this.#viewportStale = false;
    this.#renderer.setPixelRatio(pixelRatioFor(devicePixelRatio, this.#touch, this.#tier));
    const { clientWidth: width, clientHeight: height } = this.#options.canvas;
    if (width === 0 || height === 0) return;
    this.#width = width;
    this.#height = height;
    this.#renderer.setSize(width, height, false);
    this.#camera.aspect = width / height;
    this.#camera.updateProjectionMatrix();
  }

  readonly #viewportChanged = (): void => {
    this.#viewportStale = true;
    this.#loop.redraw();
  };

  readonly #resized = (): void => {
    const { clientWidth: width, clientHeight: height } = this.#options.canvas;
    if (width !== 0 && height !== 0 && (width !== this.#width || height !== this.#height)) this.#viewportChanged();
  };

  #stopOrGo(): void {
    this.#loop.set({ covered: this.#covered || this.#lost });
    this.#loop.redraw();
  }

  cover(covered: boolean): void {
    this.#covered = covered;
    this.#stopOrGo();
  }

  dispose(): void {
    this.#owner.dispose();
  }

  stats(): SceneStats {
    const { render, memory } = this.#renderer.info;
    return {
      frames: this.#frames,
      tier: this.#tier,
      ratio: this.#renderer.getPixelRatio(),
      probing: this.#probing,
      calls: render.calls,
      geometries: memory.geometries,
      textures: memory.textures,
    };
  }
}

/** Starts the scene on a canvas. Throws where WebGL2 is refused. */
export const startScene = (options: SceneOptions, clock: FrameClock = browserClock): Scene =>
  new LiveScene(options, clock);
