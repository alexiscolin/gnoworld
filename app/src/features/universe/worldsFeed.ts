// What the scene is told of the default universe's worlds. The fixed places stand at once, and the file joins them when it comes, if it does,
// read once; the page's text keeps its room at any size, its box measured on the page, as the globe's circle is.
import { worldsDrawn as counted } from "@gnoworld/core";
import { readWorlds } from "../../lib/chain/realms.ts";
import type { CosmosWorld, LabelSignals } from "../../scene/cosmos/cosmosWorld.ts";
import type { Scene } from "../../scene/scene.ts";
import { worldsDrawn } from "./worldsCount.ts";

// Who is here changes by the minute: asked again each minute while the cosmos shows (the server's answer keeps a minute too).
const PRESENCE_MS = 60_000;
const loadSignals = () => import("./signals.ts");

export class WorldsFeed {
  readonly #leaving = new AbortController();
  #worlds: readonly CosmosWorld[] = [];
  #written: string | undefined;
  #asked = false;
  #shown = false;
  #clearing: AbortController | undefined;
  #signals: LabelSignals | undefined;
  #polling: AbortController | undefined;

  /** Says whether the page wants the worlds on `scene`. */
  sync(scene: Scene, wanted: boolean): void {
    if (wanted === this.#shown) return;
    this.#shown = wanted;
    this.#hand(scene, wanted ? this.#worlds : undefined);
    this.#clearing?.abort();
    this.#polling?.abort();
    if (wanted) this.#keepTextClear(scene);
    if (wanted) this.#poll(scene);
    if (wanted && !this.#asked) this.#read(scene);
  }

  // The file's time goes with its worlds, once there is one: it ages their calls; the signals, once come, name them.
  #hand(scene: Scene, worlds: readonly CosmosWorld[] | undefined): void {
    if (worlds !== undefined && this.#signals !== undefined) scene.cosmos(worlds, this.#written, this.#signals);
    else if (this.#written === undefined) scene.cosmos(worlds);
    else scene.cosmos(worlds, this.#written);
  }

  // The names and visits as soon as their chunk comes (F3778: never waiting on the server), then who is here, now, and each minute while the
  // cosmos shows once the server has answered; a read that ends after the cosmos left is let go.
  #poll(scene: Scene): void {
    const polling = new AbortController();
    this.#polling = polling;
    let timer: ReturnType<typeof setInterval> | undefined;
    const ask = () => {
      loadSignals()
        .then(({ localSignals, readSignals }) => {
          const kept = this.#signals ?? localSignals(Date.now());
          if (this.#signals === undefined && !polling.signal.aborted) {
            this.#signals = kept;
            this.#hand(scene, this.#worlds);
          }
          return readSignals(kept);
        })
        .then(
          (signals) => {
            if (polling.signal.aborted || signals === undefined) return;
            this.#signals = signals;
            this.#hand(scene, this.#worlds);
            timer ??= setInterval(ask, PRESENCE_MS);
          },
          () => undefined,
        );
    };
    polling.signal.addEventListener("abort", () => {
      clearInterval(timer);
    });
    ask();
  }

  #keepTextClear(scene: Scene): void {
    const clearing = new AbortController();
    this.#clearing = clearing;
    const measure = () => {
      const box = document.querySelector("[data-clear]")?.getBoundingClientRect();
      if (box !== undefined) scene.keepClear({ left: box.left, top: box.top, right: box.right, bottom: box.bottom });
    };
    window.addEventListener("resize", measure, { signal: clearing.signal });
    measure();
  }

  #read(scene: Scene): void {
    this.#asked = true;
    readWorlds(import.meta.env.BASE_URL, { signal: this.#leaving.signal }).then(
      (file) => {
        if (file === undefined) return;
        this.#worlds = file.worlds;
        worldsDrawn(counted(file.worlds));
        this.#written = file.updated;
        if (this.#shown) this.#hand(scene, this.#worlds);
      },
      () => undefined,
    );
  }

  /** The page's scene has gone for good. */
  leave(): void {
    this.#leaving.abort();
    this.#clearing?.abort();
    this.#polling?.abort();
  }
}
