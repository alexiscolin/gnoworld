// A world's page in the scene, behind a chunk of its own (scene/door.ts): its view and what feeds it, one feed a world. The page asks; this
// part reads the worlds' file and the page's store for it, and hands the view its moons.
import type { EarthDevice } from "../earth/device.ts";
import { WorldFeed, type FeedOptions, type WorldPage } from "./feed.ts";
import { WorldView, type MoonMark, type WorldPlace, type WorldSaid } from "./view.ts";

export type { MoonMark, WorldPage, WorldSaid };

/** What a world's page asks of the scene: the place, the page, and what the page reads and keeps for it. */
export interface WorldAsk
  extends WorldPlace, Pick<FeedOptions, "universe" | "page" | "file" | "visited" | "remember"> {}

export class WorldPart {
  readonly #view: WorldView;
  #feed: { readonly id: string; readonly feed: WorldFeed } | undefined;

  constructor(device: EarthDevice) {
    this.#view = new WorldView(device);
  }

  /** Stands the world `ask` names, or takes it away. */
  show(ask: WorldAsk | undefined, said: WorldSaid): void {
    if (this.#feed !== undefined && this.#feed.id !== ask?.id) {
      this.#feed.feed.dispose();
      this.#feed = undefined;
    }
    this.#view.show(ask, said);
    if (ask === undefined) return;
    this.#feed ??= { id: ask.id, feed: new WorldFeed(this.#view, ask) };
    this.#feed.feed.ring(ask.page.ring);
  }

  moons(marks: readonly MoonMark[]): void {
    this.#view.moons(marks);
  }

  resize(width: number, height: number, ratio: number): void {
    this.#view.resize(width, height, ratio);
  }

  tick(seconds: number): void {
    this.#view.tick(seconds);
  }

  restored(): void {
    this.#view.restored();
  }

  dispose(): void {
    this.#feed?.feed.dispose();
    this.#view.dispose();
  }

  stats(): ReturnType<WorldView["stats"]> {
    return this.#view.stats();
  }
}
