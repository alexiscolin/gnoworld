// The scene's host in the page: it decides what a device gets, loads the 3D when that comes, and says how it went. No React, so the
// component only reads its status (docs/ARCHITECTURE.md, "Effects only synchronize").
import { PHONE_QUERY, sceneOffer } from "@gnoworld/core";
import type { StoreApi } from "zustand/vanilla";
import { savesData } from "../../lib/saveData.ts";
import { rememberedTier, rememberLow } from "../../lib/sceneTier.ts";
import type { EarthState } from "../../scene/earth/view.ts";
import type { Scene } from "../../scene/scene.ts";
import type { AppState } from "../../store/index.ts";
import { gpuCanDraw, showJourneys } from "./gpu.ts";
import { loadScene } from "./loadScene.ts";
import { WorldsFeed } from "./worldsFeed.ts";

/** `loading` came by itself; `asked` is the reader's press, which the button shows. */
export type SceneStatus = "off" | "none" | "offered" | "loading" | "asked" | "on" | "failed";

/** Whether the page shows space, and the Earth or the default universe's worlds in it. */
export type Shown = boolean | "earth" | "cosmos";

/** What the Earth's signs need of the page: this root lies outside its store and its router. */
export interface EarthPage {
  readonly store: StoreApi<AppState>;
  /** Goes to an address of the page, by its router. */
  readonly open: (href: string) => void;
}

const nothing = () => undefined;

// The plate where the page fixes it beside the globe: in the flow it scrolls, and the canvas does not. Its fill as sRGB bytes, whatever
// colour space the browser computes it in, for the scene paints it again behind the globe.
function plateBeside(globe: HTMLElement) {
  const plate = document.querySelector<HTMLElement>("[data-look='plate']");
  const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (plate === null || context === null || getComputedStyle(globe).position !== "fixed") return undefined;
  const { left, top, right, bottom } = plate.getBoundingClientRect();
  context.fillStyle = getComputedStyle(plate, "::before").backgroundColor;
  context.fillRect(0, 0, 1, 1);
  const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;
  return { left, top, right, bottom, fill: [red, green, blue] as const };
}

// The circle the page keeps for the globe, on the page and not on the window: a page scrolled away keeps its globe.
function circleOf(globe: HTMLElement) {
  const { left, top, width } = globe.getBoundingClientRect();
  if (width <= 0) return undefined;
  const plate = plateBeside(globe);
  return {
    x: left + width / 2,
    y: top + scrollY + width / 2,
    radius: width / 2,
    ...(plate === undefined ? {} : { plate }),
  };
}

export class SceneHost {
  readonly #listeners = new Set<() => void>();
  #status: SceneStatus = "off";
  #canvas: HTMLCanvasElement | undefined;
  #scene: Scene | undefined;
  #shown = false;
  #wantsEarth = false;
  #wantsWorlds = false;
  readonly #feed = new WorldsFeed();
  #earth: EarthState = "gone";
  #watching: AbortController | undefined;
  #decided = false;

  readonly subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  readonly status = () => this.#status;

  readonly earth = () => this.#earth;

  /** The ground the signs stand on, once the scene runs. */
  readonly ground = () => this.#scene?.ground;

  #tell(): void {
    this.#markPage();
    for (const listener of this.#listeners) listener();
  }

  #say(status: SceneStatus): void {
    this.#status = status;
    this.#tell();
  }

  // The page's stylesheet keeps the globe's room and opens the plate from this: "waiting" while the scene may yet come, so a window that
  // loads it by itself does not jump; "none" where nothing will. A lost context takes both away.
  #markPage(): void {
    const globe = this.#wantsEarth ? document.querySelector<HTMLElement>("[data-globe]") : null;
    if (globe === null) return;
    const shows = this.#status === "on" && (this.#earth === "loading" || this.#earth === "drawn");
    const coming = this.#status === "off" || this.#status === "loading";
    if (shows) globe.dataset["earth"] = this.#earth;
    else globe.dataset["earth"] = coming ? "waiting" : "none";
  }

  readonly #earthSaid = (state: EarthState): void => {
    this.#earth = state;
    this.#tell();
  };

  // The circle has no size until the page keeps its room: the mark comes first.
  #watchGlobe(scene: Scene): void {
    const globe = document.querySelector<HTMLElement>("[data-globe]");
    if (globe === null) return;
    const watching = new AbortController();
    this.#watching = watching;
    this.#earthSaid("loading");
    const place = () => {
      const circle = circleOf(globe);
      if (circle !== undefined) scene.earth(circle, this.#earthSaid);
    };
    const observer = new ResizeObserver(place);
    observer.observe(globe);
    watching.signal.addEventListener("abort", () => {
      observer.disconnect();
    });
    window.addEventListener("resize", place, { signal: watching.signal });
    place();
  }

  #stopWatching(): void {
    this.#watching?.abort();
    this.#watching = undefined;
  }

  #syncEarth(): void {
    const scene = this.#scene;
    if (scene === undefined) return;
    if (this.#wantsEarth && this.#watching === undefined) this.#watchGlobe(scene);
    else if (!this.#wantsEarth && this.#watching !== undefined) {
      this.#stopWatching();
      scene.earth(undefined, this.#earthSaid);
    }
  }

  #syncWorlds(): void {
    if (this.#scene !== undefined) this.#feed.sync(this.#scene, this.#wantsWorlds);
  }

  /** The canvas is on the page; what this returns takes the scene away with it. */
  attach(canvas: HTMLCanvasElement) {
    this.#canvas = canvas;
    return () => {
      this.#feed.leave();
      this.#stopWatching();
      this.#scene?.dispose();
      this.#canvas = undefined;
    };
  }

  /** Whether the page shows the scene: the first that does decides, one that does not covers it. */
  show(shown: Shown): void {
    this.#shown = shown !== false;
    this.#wantsEarth = shown === "earth";
    this.#wantsWorlds = shown === "cosmos";
    this.#scene?.cover(!this.#shown);
    this.#syncEarth();
    this.#syncWorlds();
    if (this.#shown && !this.#decided) this.#decide();
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
    this.#syncEarth();
    this.#syncWorlds();
  }
}
