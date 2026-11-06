// A world's page in the scene, behind a chunk of its own (scene/door.ts): its view and what feeds it, one feed a world. The page asks; this
// part reads the worlds' file and the page's store for it, and hands the view its moons. A station's page (8l) stands its station in the
// planet's place, with no feed, from a chunk of its own: a planet's page pays nothing for it.
import type { EarthDevice } from "../earth/device.ts";
import { WorldFeed, type FeedOptions, type WorldPage } from "./feed.ts";
import type { StationAsk, StationView } from "./stationView.ts";
import { WorldView, type MoonMark, type WorldPlace, type WorldSaid } from "./view.ts";

export type { MoonMark, WorldPage, WorldSaid };

/** What a world's page asks of the scene: the place, the page, and what the page reads for it. */
export interface WorldAsk extends WorldPlace, Pick<FeedOptions, "universe" | "page" | "file" | "visited"> {}

const nothing = () => undefined;

export class WorldPart {
  readonly #device: EarthDevice;
  readonly #view: WorldView;
  #feed: { readonly id: string; readonly feed: WorldFeed } | undefined;
  // The station's view once its chunk came, what was last asked of it, and the screen it is drawn on.
  #station: StationView | undefined;
  #loading = false;
  #stationAsk: { ask: StationAsk | undefined; said: WorldSaid } = { ask: undefined, said: nothing };
  readonly #screen = { width: 1, height: 1, ratio: 1 };
  #disposed = false;

  constructor(device: EarthDevice) {
    this.#device = device;
    this.#view = new WorldView(device);
  }

  /** Stands the world `ask` names, or takes it away; a station's page, its station. */
  show(ask: WorldAsk | undefined, said: WorldSaid): void {
    const station = ask?.page.station;
    const world = station === undefined ? ask : undefined;
    if (this.#feed !== undefined && this.#feed.id !== world?.id) {
      this.#feed.feed.dispose();
      this.#feed = undefined;
    }
    this.#showStation(world === undefined ? ask : undefined, said);
    // A station's page tells its own state: the world's view, taken away, says nothing then.
    this.#view.show(world, station === undefined ? said : nothing);
    if (world === undefined) return;
    this.#feed ??= { id: world.id, feed: new WorldFeed(this.#view, world) };
    this.#feed.feed.ring(world.page.ring);
  }

  // The station's chunk is asked once, at the first station's page; one that does not come says the station failed.
  #showStation(page: WorldAsk | undefined, said: WorldSaid): void {
    const station = page?.page.station;
    const ask = page === undefined || station === undefined ? undefined : { ...page, ...station };
    this.#stationAsk = { ask, said };
    if (this.#station !== undefined || ask === undefined) {
      this.#station?.show(ask, said);
      return;
    }
    said("loading");
    if (this.#loading) return;
    this.#loading = true;
    import("./stationView.ts").then(
      ({ StationView: Loaded }) => {
        if (this.#disposed) return;
        const view = new Loaded(this.#device, this.#screen);
        this.#station = view;
        view.show(this.#stationAsk.ask, this.#stationAsk.said);
      },
      () => {
        this.#loading = false;
        if (this.#stationAsk.ask !== undefined) this.#stationAsk.said("failed");
      },
    );
  }

  moons(marks: readonly MoonMark[]): void {
    this.#view.moons(marks);
  }

  resize(width: number, height: number, ratio: number): void {
    Object.assign(this.#screen, { width, height, ratio });
    this.#view.resize(width, height, ratio);
    this.#station?.place();
  }

  tick(seconds: number): void {
    this.#view.tick(seconds);
    this.#station?.tick(seconds);
  }

  restored(): void {
    this.#view.restored();
  }

  dispose(): void {
    this.#disposed = true;
    for (const owned of [this.#feed?.feed, this.#view, this.#station]) owned?.dispose();
  }

  stats(): ReturnType<WorldView["stats"]> & { station: ReturnType<StationView["stats"]> | undefined } {
    return { ...this.#view.stats(), station: this.#station?.stats() };
  }
}
