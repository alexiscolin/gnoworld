// The scene's host in the page: it decides what a device gets, loads the 3D when that comes, and says how it went. No React, so the
// component only reads its status (docs/ARCHITECTURE.md, "Effects only synchronize").
import { PHONE_QUERY, sceneOffer } from "@gnoworld/core";
import type { StoreApi } from "zustand/vanilla";
import { savesData } from "../../lib/saveData.ts";
import { rememberedTier, rememberLow } from "../../lib/sceneTier.ts";
import type { EarthState } from "../../scene/earth/view.ts";
import type { Scene } from "../../scene/scene.ts";
import type { MoonMark, WorldPage } from "../../scene/world/part.ts";
import type { AppState } from "../../store/index.ts";
import { gpuCanDraw, showJourneys } from "./gpu.ts";
import { loadScene } from "./loadScene.ts";
import { circleOf, tintPage, worldAsk } from "./globe.ts";
import { WorldsFeed } from "./worldsFeed.ts";

/** `loading` came by itself; `asked` is the reader's press, which the button shows. */
export type SceneStatus = "off" | "none" | "offered" | "loading" | "asked" | "on" | "failed";

/** A world's page: the world it shows, by the id the worlds' job groups it under. */
export interface WorldShown {
  readonly world: string;
}

/** Whether the page shows space, and the Earth, the default universe's worlds or one world in it. */
export type Shown = boolean | "earth" | "cosmos" | WorldShown;

export type { WorldPage };

/** What the Earth's signs need of the page: this root lies outside its store and its router. */
export interface EarthPage {
  readonly store: StoreApi<AppState>;
  /** Goes to an address of the page, by its router. */
  readonly open: (href: string) => void;
}

const nothing = () => undefined;
// The one form a world's colour takes on the page: anything else the scene said is left out.
const COLOUR = /^#[0-9a-f]{6}$/;

export class SceneHost {
  readonly #listeners = new Set<() => void>();
  #status: SceneStatus = "off";
  #canvas: HTMLCanvasElement | undefined;
  #scene: Scene | undefined;
  #shown = false;
  #wantsEarth = false;
  #wantsWorlds = false;
  #wantsWorld: string | undefined;
  #page: EarthPage | WorldPage | undefined;
  #world: EarthState = "gone";
  #watched: string | undefined;
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

  /** Where a world's page hands its moons, once the scene runs. */
  readonly sky = () => {
    const scene = this.#scene;
    return scene === undefined
      ? undefined
      : {
          moons: (marks: readonly MoonMark[]) => {
            scene.worldMoons(marks);
          },
        };
  };

  readonly world = () => this.#world;

  #tell(): void {
    this.#markPage();
    for (const listener of this.#listeners) listener();
  }

  #say(status: SceneStatus): void {
    this.#status = status;
    this.#tell();
  }

  // The page's stylesheet keeps the globe's room and opens the plate from this: "waiting" while the scene may yet come, so a window that
  // loads it by itself does not jump; "none" where nothing will. A lost context takes both away. The Earth's page and a world's alike.
  #markPage(): void {
    const wanted = this.#wantsEarth || this.#wantsWorld !== undefined;
    const globe = wanted ? document.querySelector<HTMLElement>("[data-globe]") : null;
    if (globe === null) return;
    const state = this.#bodyState(this.#wantsEarth ? this.#earth : this.#world);
    globe.dataset[this.#wantsEarth ? "earth" : "world"] = state;
    if (state !== "drawn") tintPage(undefined);
  }

  #bodyState(body: EarthState): EarthState | "waiting" | "none" {
    if (this.#status === "on" && (body === "loading" || body === "drawn")) return body;
    return this.#status === "off" || this.#status === "loading" ? "waiting" : "none";
  }

  readonly #worldSaid = (state: EarthState, colour?: string): void => {
    this.#world = state;
    this.#tell();
    if (state !== "drawn" || colour === undefined || !COLOUR.test(colour)) return;
    tintPage(colour);
    // The plate took the world's colour: the scene paints it again in the circle, read once more.
    queueMicrotask(this.#place);
  };

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
    const world = this.#wantsWorld;
    this.#watched = world;
    if (world === undefined) this.#earthSaid("loading");
    else this.#worldSaid("loading");
    const place = () => {
      const circle = circleOf(globe);
      if (circle === undefined) return;
      if (world === undefined) scene.earth(circle, this.#earthSaid);
      else if (this.#page !== undefined && "slug" in this.#page)
        scene.world(worldAsk(circle, world, this.#page), this.#worldSaid);
    };
    this.#place = place;
    const observer = new ResizeObserver(place);
    observer.observe(globe);
    watching.signal.addEventListener("abort", () => {
      observer.disconnect();
    });
    window.addEventListener("resize", place, { signal: watching.signal });
    place();
  }

  #place: () => void = nothing;

  #stopWatching(): void {
    this.#watching?.abort();
    this.#watching = undefined;
    this.#place = nothing;
  }

  #syncEarth(): void {
    const scene = this.#scene;
    if (scene === undefined) return;
    const wanted = this.#wantsEarth || this.#wantsWorld !== undefined;
    const moved = this.#watching !== undefined && this.#watched !== this.#wantsWorld;
    if (this.#watching !== undefined && (!wanted || moved)) {
      const world = this.#watched;
      this.#stopWatching();
      if (world === undefined) scene.earth(undefined, this.#earthSaid);
      else scene.world(undefined, this.#worldSaid);
    }
    if (wanted && this.#watching === undefined) this.#watchGlobe(scene);
    else this.#place();
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
      tintPage(undefined);
      this.#scene?.dispose();
      this.#canvas = undefined;
    };
  }

  /** Whether the page shows the scene: the first that does decides, one that does not covers it. */
  show(shown: Shown, page?: EarthPage | WorldPage): void {
    this.#shown = shown !== false;
    this.#page = page;
    this.#wantsEarth = shown === "earth";
    this.#wantsWorlds = shown === "cosmos";
    this.#wantsWorld = typeof shown === "object" ? shown.world : undefined;
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
