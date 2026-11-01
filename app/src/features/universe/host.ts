// The scene's host in the page: it decides what a device gets, loads the 3D when that comes, and says how it went. No React, so the
// component only reads its status (docs/ARCHITECTURE.md, "Effects only synchronize").
import { PHONE_QUERY, sceneOffer } from "@gnoworld/core";
import { savesData } from "../../lib/saveData.ts";
import { rememberedTier, rememberTier } from "../../lib/sceneTier.ts";
import type { Scene } from "../../scene/scene.ts";
import { gpuCanDraw, showJourneys } from "./gpu.ts";
import { loadScene } from "./loadScene.ts";

export type SceneStatus = "off" | "none" | "offered" | "loading" | "on" | "failed";

const nothing = () => undefined;

export class SceneHost {
  readonly #listeners = new Set<() => void>();
  #status: SceneStatus = "off";
  #canvas: HTMLCanvasElement | undefined;
  #scene: Scene | undefined;
  #shown = false;
  #decided = false;
  #timer: ReturnType<typeof setTimeout> | undefined;

  readonly subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  readonly status = () => this.#status;

  #say(status: SceneStatus): void {
    this.#status = status;
    for (const listener of this.#listeners) listener();
  }

  /** The canvas is on the page; what this returns takes everything away with it. */
  readonly attach = (canvas: HTMLCanvasElement) => {
    this.#canvas = canvas;
    return () => {
      clearTimeout(this.#timer);
      this.#scene?.dispose();
      this.#scene = undefined;
      this.#canvas = undefined;
      this.#decided = false;
    };
  };

  /** Whether the page shows the scene: the first that does decides, one that does not covers it. */
  show(shown: boolean): void {
    this.#shown = shown;
    this.#scene?.cover(!shown);
    if (shown && !this.#decided) this.#decide();
  }

  #decide(): void {
    this.#decided = true;
    const offer = sceneOffer({ weak: !gpuCanDraw(), phone: matchMedia(PHONE_QUERY).matches, savesData: savesData() });
    if (offer === "none") this.#say("none");
    else if (offer === "ask") this.#say("offered");
    else
      this.#timer = setTimeout(() => {
        this.load();
      });
  }

  /** Loads the 3D and starts it, then calls `settled`; a failure leaves the page as it is, and says so. */
  readonly load = (settled: () => void = nothing): void => {
    if (this.#status === "loading" || this.#status === "on") return;
    this.#say("loading");
    loadScene()
      .then(({ startScene }) => {
        if (this.#canvas === undefined) return;
        this.#started(
          startScene({
            canvas: this.#canvas,
            remembered: rememberedTier(),
            remember: rememberTier,
            onLost: (lost) => {
              this.#say(lost ? "failed" : "on");
            },
          }),
        );
      })
      .catch(() => {
        this.#say("failed");
      })
      .then(settled, settled);
  };

  #started(scene: Scene): void {
    this.#scene = scene;
    scene.cover(!this.#shown);
    showJourneys(scene);
    this.#say("on");
  }
}
