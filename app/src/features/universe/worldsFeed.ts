// What the scene is told of the default universe's worlds. The fixed places stand at once, and the file joins them when it comes, if it does,
// read once; the page's text keeps its room at any size, its box measured on the page, as the globe's circle is.
import type { CosmosWorld, LabelSignals } from "../../scene/cosmos/cosmosWorld.ts";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Scene } from "../../scene/scene.ts";
import type { AppState } from "../../store/index.ts";
import type { RailPlaces } from "./railWorlds.ts";
import { worldsFile } from "./worldsFile.ts";

// Who is here changes by the minute: asked again each minute while the cosmos shows (the server's answer keeps a minute too).
const PRESENCE_MS = 60_000;
const loadSignals = () => import("./signals.ts");

/** What the cosmos's page hands its rail (7i): its router, and the places its links go to. */
export interface CosmosPage {
  readonly open: (href: string) => void;
  readonly places: RailPlaces;
  /** Where the rail reads the worlds the reader follows (slice 8): the page's store, and the universe they are keyed in. */
  readonly follows?: { readonly store: StoreApi<AppState>; readonly universe: string };
}

/** The worlds and what is known of them now, once both are: what the rail reads (7i). */
export interface Known {
  readonly worlds: readonly CosmosWorld[];
  readonly signals: LabelSignals;
  /** The page's own signals, the server not heard yet: what the rail shows till it is holds no minute. */
  readonly unheard?: true;
}

type Draw = (
  ids: readonly string[],
  size: number,
  signal: AbortSignal,
) => Promise<ReadonlyMap<string, string>> | undefined;

/** The planets' portraits for the rail (7i): each world asked of the scene once for as long as the page lives, drawn or not, so a return
 * to the cosmos asks none again; none asked while no scene can draw them; and what the cosmos covered stopped, asked again on the return. */
export class Portraits {
  readonly #draw: Draw;
  readonly #asked = new Set<string>();
  readonly #drawn = createStore<ReadonlyMap<string, string>>(() => new Map());
  #asking = new AbortController();

  constructor(draw: Draw) {
    this.#draw = draw;
  }

  readonly subscribe = this.#drawn.subscribe;

  readonly drawn = this.#drawn.getState;

  ask(ids: readonly string[], size: number): void {
    const fresh = ids.filter((id) => !this.#asked.has(id));
    const { signal } = this.#asking;
    const drawing = fresh.length === 0 ? undefined : this.#draw(fresh, size, signal);
    if (drawing === undefined) return;
    for (const id of fresh) this.#asked.add(id);
    // A world a stopped drawing did not draw is asked again on the return.
    const left = (drawn: ReadonlyMap<string, string>) => {
      if (signal.aborted) for (const id of fresh) if (!drawn.has(id)) this.#asked.delete(id);
    };
    drawing.then(
      (drawn) => {
        this.#drawn.setState((before) => new Map([...before, ...drawn]), true);
        left(drawn);
      },
      () => {
        left(new Map());
      },
    );
  }

  /** Stops what is being drawn: the cosmos is covered, and lends the scene's frames to nothing it shows. */
  stop(): void {
    this.#asking.abort();
    this.#asking = new AbortController();
  }
}

export class WorldsFeed {
  readonly #leaving = new AbortController();
  readonly #known = createStore<Known | undefined>(() => undefined);
  #scene: Scene | undefined;
  #came = false;
  #worlds: readonly CosmosWorld[] = [];
  #written: string | undefined;
  #asked = false;
  #shown = false;
  #clearing: AbortController | undefined;
  #signals: LabelSignals | undefined;
  #heard = false;
  #polling: AbortController | undefined;

  /** Hears each change of what `data` gives; what it returns lets go. */
  readonly subscribe = this.#known.subscribe;

  /** The worlds and what is known of them, as last told to the cosmos, once both are. */
  readonly data = this.#known.getState;

  /** The planets' portraits the scene drew for the rail, kept as long as the page lives. */
  readonly portraits = new Portraits((ids, size, signal) => this.#scene?.portraits(ids, size, signal));

  /** Says whether the page wants the worlds on `scene`. */
  sync(scene: Scene, wanted: boolean): void {
    this.#scene = scene;
    if (wanted === this.#shown) return;
    this.#shown = wanted;
    // What was heard before the cosmos was covered is old once it shows again: the server's next answer is the first again. Covered, the
    // portraits being drawn stop.
    if (wanted) this.#heard = false;
    else this.portraits.stop();
    this.#hand(scene, wanted ? this.#worlds : undefined);
    this.#clearing?.abort();
    this.#polling?.abort();
    if (wanted) this.#keepTextClear(scene);
    if (wanted) this.#poll(scene);
    if (wanted && !this.#asked) this.#read(scene);
  }

  // The file's time goes with its worlds, once there is one: it ages their calls; the signals, once come, name them.
  #hand(scene: Scene, worlds: readonly CosmosWorld[] | undefined): void {
    if (worlds !== undefined && this.#came && this.#signals !== undefined)
      this.#known.setState({ worlds, signals: this.#signals, ...(this.#heard ? {} : { unheard: true }) }, true);
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
            this.#heard = true;
            this.#hand(scene, this.#worlds);
            timer ??= setInterval(whileSeen, PRESENCE_MS);
          },
          () => undefined,
        );
    };
    // A hidden tab asks nothing (F3783), and asks at once when it shows again, once the server has answered.
    const whileSeen = () => {
      if (!document.hidden) ask();
    };
    document.addEventListener(
      "visibilitychange",
      () => {
        if (timer !== undefined) whileSeen();
      },
      { signal: polling.signal },
    );
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
    // The hero and the list under it grow after the first measure, as the count, the faces and the worlds come (8m): the box was left short.
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(measure);
    for (const element of document.querySelectorAll("[data-clear], nav[data-rail]")) watch.observe(element);
    clearing.signal.addEventListener("abort", () => {
      watch.disconnect();
    });
  }

  // The scene's own read, under its signal: a file that comes as the scene goes for good is let go here.
  #read(scene: Scene): void {
    this.#asked = true;
    worldsFile(this.#leaving.signal).then(
      (file) => {
        if (file === undefined || this.#leaving.signal.aborted) return;
        this.#worlds = file.worlds;
        this.#written = file.updated;
        this.#came = true;
        if (this.#shown) this.#hand(scene, this.#worlds);
      },
      () => undefined,
    );
  }

  /** How many worlds of the file a namespace holds, each once, as its system draws them: a system's crumb counts them (7v). */
  readonly worldsIn = (namespace: string): number =>
    new Set(this.#worlds.filter((world) => world.namespace === namespace).map(({ id }) => id)).size;

  /** The page's scene has gone for good. */
  leave(): void {
    this.#leaving.abort();
    this.#clearing?.abort();
    this.#polling?.abort();
  }
}
