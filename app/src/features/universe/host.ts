// The scene's host in the page: it decides what a device gets, loads the 3D when that comes, and says how it went. No React, so the
// component only reads its status (docs/ARCHITECTURE.md, "Effects only synchronize").
import { PHONE_QUERY, sceneOffer } from "@gnoworld/core";
import { savesData } from "../../lib/saveData.ts";
import { rememberedTier, rememberLow } from "../../lib/sceneTier.ts";
import type { Scene } from "../../scene/scene.ts";
import { gpuCanDraw, showJourneys } from "./gpu.ts";
import { loadScene } from "./loadScene.ts";

/** `loading` came by itself; `asked` is the reader's press, which the button shows. */
export type SceneStatus = "off" | "none" | "offered" | "loading" | "asked" | "on" | "failed";

const nothing = () => undefined;

export class SceneHost {
  readonly #listeners = new Set<() => void>();
  #status: SceneStatus = "off";
  #canvas: HTMLCanvasElement | undefined;
  #scene: Scene | undefined;
  #shown = false;
  #decided = false;

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

  /** The canvas is on the page; what this returns takes the scene away with it. */
  attach(canvas: HTMLCanvasElement) {
    this.#canvas = canvas;
    return () => {
      this.#scene?.dispose();
      this.#canvas = undefined;
    };
  }

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
    else this.#load("loading", nothing);
  }

  /** "View in space": loads the 3D, then calls `settled`, whichever way it went. */
  readonly press = (settled: () => void): void => {
    this.#load("asked", settled);
  };

  #load(status: "loading" | "asked", settled: () => void): void {
    this.#say(status);
    loadScene()
      .then(({ startScene }) => {
        if (this.#canvas === undefined) return;
        this.#started(
          startScene({
            canvas: this.#canvas,
            remembered: rememberedTier(),
            remember: rememberLow,
            onLost: (lost) => {
              this.#say(lost ? "failed" : "on");
            },
          }),
        );
      })
      .catch(() => {
        this.#say("failed");
      })
      .finally(settled);
  }

  #started(scene: Scene): void {
    this.#scene = scene;
    scene.cover(!this.#shown);
    showJourneys(scene);
    this.#say("on");
  }
}
