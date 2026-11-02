// The scene (docs/ARCHITECTURE.md, "The scene"), behind its lazy chunk: the renderer, its one loop, the Auto probe and what stops them.
// It draws through one owner, and imports no React: the universe feature mounts it.
import { type ClearBox, type Point, type ProbeVerdict, type Tier } from "@gnoworld/core";
import { Color, PerspectiveCamera, Scene as Stage, type WebGLRenderer } from "three";
import type { CosmosWorld } from "./cosmos/cosmosWorld.ts";
import { Disposer } from "./disposer.ts";
import type { Ground } from "./earth/marks.ts";
import { EarthView, type Circle, type EarthState } from "./earth/view.ts";
import { Eye } from "./eye.ts";
import { browserClock, FrameLoop, type FrameClock } from "./loop.ts";
import { Probe } from "./probe.ts";
import { rendered, type Scene, type SceneOptions, type SceneStats } from "./sceneStats.ts";
import { createRenderer } from "./renderer.ts";
import { Space } from "./space.ts";
import { Viewport } from "./viewport.ts";
import { Parts } from "./parts.ts";
import type { MoonMark, WorldAsk, WorldSaid } from "./world/part.ts";
import { MOTION, watchAim, watchCanvas, watchPage, watchScreen } from "./watch.ts";

const TOUCH = "(pointer: coarse)";
// The frames' deep black, read off the far corners of f0004, f0005 and f0017. The stage's, for a restored context resets the clear colour.
const DEEP_BLACK = 0x010101;
const LENS = { fieldOfView: 50, near: 0.1, far: 2000 } as const;
// The sky beside the worlds: the warmth comes from the suns, with black between them (frame 4).
const VEILED = 0.3;

export type { Scene, SceneOptions };

class LiveScene implements Scene {
  readonly #owner = new Disposer();
  readonly #options: SceneOptions;
  readonly #touch = matchMedia(TOUCH).matches;
  readonly #renderer: WebGLRenderer;
  readonly #stage = new Stage();
  readonly #camera = new PerspectiveCamera(LENS.fieldOfView, 1, LENS.near, LENS.far);
  readonly #motion = matchMedia(MOTION);
  readonly #eye = new Eye();
  readonly #space: Space;
  readonly #loop: FrameLoop;
  readonly #viewport: Viewport;
  readonly #earth: EarthView;
  readonly #parts: Parts;
  readonly ground: Ground;
  readonly #probe: Probe;
  #tier: Tier;
  #covered = false;
  #lost = false;
  #frames = 0;
  #seconds = 0;
  #refused = false;

  constructor(options: SceneOptions, clock: FrameClock) {
    const { canvas, remembered } = options;
    this.#options = options;
    this.#tier = remembered ?? "high";
    this.#probe = new Probe(remembered === undefined && !this.#motion.matches, this.#busy, this.#judged);
    this.#renderer = createRenderer(canvas, !this.#touch && this.#tier === "high");
    this.#renderer.debug.onShaderError = this.#shaderRefused;
    this.#stage.background = new Color(DEEP_BLACK);
    this.#owner.add({
      dispose: () => {
        this.#renderer.forceContextLoss();
        this.#renderer.dispose();
      },
    });
    this.#space = new Space(this.#stage, this.#owner);
    const device = {
      renderer: this.#renderer,
      stage: this.#stage,
      camera: this.#camera,
      halved: () => this.#touch || this.#tier === "low",
      base: import.meta.env.BASE_URL,
      moved: this.#redraw,
      // The Earth or the worlds stood: the first frames timed a bare sky, and what the page draws is timed once more.
      stood: () => {
        this.#probe.earthStood(remembered === undefined && this.#tier !== "low" && !this.#motion.matches);
      },
    };
    this.#earth = this.#owner.add(new EarthView(device));
    this.#parts = new Parts(device, this.#owner, () => {
      this.#viewport.changed();
    });
    this.ground = this.#earth;
    this.#viewport = new Viewport({
      canvas,
      renderer: this.#renderer,
      camera: this.#camera,
      space: this.#space,
      earth: this.#earth,
      parts: this.#parts,
      touch: this.#touch,
      tier: () => this.#tier,
      owed: this.#redraw,
    });
    this.#viewport.apply();
    this.#loop = new FrameLoop(clock, this.#draw);
    this.#owner.add({
      dispose: () => {
        this.#loop.stop();
      },
    });
    this.#loop.set({ busy: this.#probe.running });
    this.#watch(canvas);
  }

  #watch(canvas: HTMLCanvasElement): void {
    const { signal } = this.#owner;
    watchPage(this.#loop, signal);
    watchScreen(this.#viewport.changed, signal);
    watchAim(this.#eye.aim, signal);
    watchCanvas(
      canvas,
      {
        resized: this.#viewport.resized,
        lost: (now) => {
          this.#lost = now;
          this.#space.redraw();
          this.#options.onLost(now);
          this.#stopOrGo();
          if (!now) {
            this.#earth.restored();
            this.#parts.restored();
          }
        },
      },
      signal,
    );
  }

  // Three calls this in place of its own log, in the middle of a draw, which must end before anything is freed.
  readonly #shaderRefused = (gl: WebGLRenderingContext, program: WebGLProgram): void => {
    reportError(new Error(`a shader was refused: ${gl.getProgramInfoLog(program) ?? ""}`));
    this.#refused = true;
  };

  readonly #draw = (delta: number): void => {
    this.#viewport.settle();
    this.#eye.advance(delta, this.#motion.matches);
    this.#camera.rotation.set(this.#eye.turn.pitch, this.#eye.turn.yaw, 0);
    this.#space.follow(this.#eye.at, this.#eye.seconds);
    this.#seconds += delta / 1000;
    this.#earth.tick(this.#seconds);
    this.#parts.tick(this.#eye.worlds, this.#eye.seconds, this.#seconds);
    this.#renderer.info.reset();
    this.#space.march(this.#renderer, this.#camera);
    this.#renderer.render(this.#stage, this.#camera);
    this.#frames += 1;
    if (this.#refused) this.#earth.refused();
    this.#refused = false;
    this.#probe.frame(delta, this.#earth.arriving);
  };

  readonly #redraw = (): void => {
    this.#loop.redraw();
  };

  readonly #busy = (busy: boolean): void => {
    this.#loop.set({ busy });
  };

  readonly #judged = (verdict: Exclude<ProbeVerdict, "pending">): void => {
    if (verdict === "keep") return;
    this.#tier = "low";
    this.#viewport.changed();
    if (verdict === "low") this.#options.remember();
  };

  #stopOrGo(): void {
    this.#loop.set({ covered: this.#covered || this.#lost });
    this.#loop.redraw();
  }

  cover(covered: boolean): void {
    this.#covered = covered;
    this.#stopOrGo();
  }

  moveTo(to: Point): void {
    this.#eye.moveTo(to);
    this.#loop.redraw();
  }

  earth(place: Circle | undefined, said: (state: EarthState) => void): void {
    this.#earth.show(place, said);
  }

  world(asked: WorldAsk | undefined, said: WorldSaid): void {
    this.#parts.world.show(asked, said);
    this.#loop.redraw();
  }

  worldMoons(marks: readonly MoonMark[]): void {
    this.#parts.world.moons(marks);
  }

  cosmos(worlds: readonly CosmosWorld[] | undefined, written?: string): void {
    this.#parts.cosmos.show(worlds, written);
    this.#space.veil(worlds === undefined ? 1 : VEILED);
    this.#loop.redraw();
  }

  keepClear(box: ClearBox | undefined): void {
    this.#parts.cosmos.keepClear(box);
    this.#loop.redraw();
  }

  dispose(): void {
    this.#owner.dispose();
  }

  stats(): SceneStats {
    return {
      frames: this.#frames,
      tier: this.#tier,
      ratio: this.#renderer.getPixelRatio(),
      probing: this.#probe.running,
      ...rendered(this.#renderer.info),
      eye: { ...this.#eye.at },
      earth: this.#earth.stats(),
      ...this.#parts.stats(),
    };
  }
}

/** Starts the scene on a canvas. Throws where WebGL2 is refused. */
export const startScene = (options: SceneOptions, clock: FrameClock = browserClock): Scene =>
  new LiveScene(options, clock);
