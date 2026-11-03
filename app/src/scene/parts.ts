// The scene's parts behind chunks of their own, the cosmos and a world's page (door.ts), and what was asked of each before it came: a page
// asks at once, the part comes when its chunk does, and is told the last thing asked.
import type { ClearBox, Point } from "@gnoworld/core";
import type { Cosmos } from "./cosmos/cosmos.ts";
import type { CosmosSight } from "./flight/flights.ts";
import type { CosmosWorld, LabelSignals } from "./cosmos/cosmosWorld.ts";
import type { Disposer } from "./disposer.ts";
import { LazyLabels } from "./cosmos/lazyLabels.ts";
import { Door } from "./door.ts";
import type { FlightGoal, Flights, FlightScene } from "./flight/flights.ts";
import type { EarthDevice } from "./earth/device.ts";
import type { MoonMark, WorldAsk, WorldPart, WorldSaid } from "./world/part.ts";
import type { PortraitDevice } from "./portraits.ts";
import type { Scene } from "./sceneStats.ts";

export class CosmosPart {
  readonly door: Door<Cosmos>;
  #worlds: readonly CosmosWorld[] | undefined;
  #written: string | undefined;
  #signals: LabelSignals | undefined;
  #box: ClearBox | undefined;
  #arrival: Parameters<Cosmos["arrive"]> | undefined;
  readonly #gone: AbortSignal;
  // The home's dive, once asked: under reduced motion or not.
  #still: boolean | undefined;
  readonly #eye: EarthDevice["eye"];

  constructor(device: EarthDevice, owner: Disposer, came: () => void) {
    this.#eye = device.eye;
    this.#gone = owner.signal;
    this.door = new Door(
      () =>
        import("./cosmos/cosmos.ts").then(
          ({ Cosmos: Loaded }) =>
            () =>
              new Loaded(device),
        ),
      owner,
      {
        came: (cosmos) => {
          // The labels' loader stands here, behind the cosmos's door, so the cosmos's chunk pays only for their calls (7h).
          cosmos.labels = new LazyLabels(owner, cosmos.seen);
          cosmos.keepClear(this.#box);
          if (this.#still !== undefined) cosmos.dive(this.#still);
          this.#tell(cosmos);
          if (this.#arrival !== undefined) cosmos.arrive(...this.#arrival);
          came();
        },
      },
    );
  }

  /** What a flight reads of the cosmos while it shows (7g). */
  get sight(): CosmosSight | undefined {
    return this.#worlds === undefined ? undefined : this.#eye?.sight;
  }

  /** The home opens with the dive, once (7d7); `still`, under reduced motion. */
  dive(still: boolean): void {
    if (this.#still !== undefined) return;
    this.#still = still;
    this.door.part?.dive(still);
  }

  show(worlds: readonly CosmosWorld[] | undefined, written?: string, signals?: LabelSignals): void {
    this.#worlds = worlds;
    this.#written = written;
    this.#signals = signals ?? this.#signals;
    if (this.door.part !== undefined) this.#tell(this.door.part);
    if (worlds !== undefined) this.door.open();
  }

  // The file's time goes with its worlds once there is one: it ages their calls; and what is known of them, once said, names them.
  #tell(cosmos: Cosmos): void {
    if (this.#signals !== undefined) cosmos.show(this.#worlds, this.#written, this.#signals);
    else if (this.#written === undefined) cosmos.show(this.#worlds);
    else cosmos.show(this.#worlds, this.#written);
  }

  keepClear(box: ClearBox | undefined): void {
    this.#box = box;
    this.door.part?.keepClear(box);
  }

  /** A system's arrival asked (7d3): told the cosmos now, or once it comes; nothing once the scene has gone. */
  arrive(id: string | undefined, go: (eye: Point) => void): void {
    if (this.#gone.aborted) return;
    this.#arrival = [id, go];
    this.door.part?.arrive(id, go);
  }
}

export class WorldDoor {
  readonly door: Door<WorldPart>;
  #asked: WorldAsk | undefined;
  #said: WorldSaid = () => undefined;
  #marks: readonly MoonMark[] = [];

  constructor(device: EarthDevice, owner: Disposer, came: () => void) {
    this.door = new Door(
      () =>
        import("./world/part.ts").then(
          ({ WorldPart: Loaded }) =>
            () =>
              new Loaded(device),
        ),
      owner,
      {
        came: (world) => {
          world.show(this.#asked, this.#said);
          world.moons(this.#marks);
          came();
        },
        // A page that still asks is told its world will not come, or it would keep the world's room for ever.
        failed: () => {
          if (this.#asked !== undefined) this.#said("failed");
        },
      },
    );
  }

  show(asked: WorldAsk | undefined, said: WorldSaid): void {
    this.#asked = asked;
    this.#said = said;
    const part = this.door.part;
    if (part !== undefined) part.show(asked, said);
    else if (asked === undefined) said("gone");
    if (asked !== undefined) this.door.open();
  }

  moons(marks: readonly MoonMark[]): void {
    this.#marks = marks;
    this.door.part?.moons(marks);
  }
}

/** Both, and the flights between them (7g), as the scene sizes, moves, restores and reads them. The flights' chunk, with camera-controls,
 * is asked as the scene starts, so the first flight finds it: one asked before it came, or if it never comes, is no flight, and the page
 * changes as it did. What the flights make of the scene's device is their chunk's. */
export class Parts {
  readonly cosmos: CosmosPart;
  readonly world: WorldDoor;
  readonly flights: Door<Flights>;
  // What the next frame draws first, before the scene's own: the rail's portraits (7i).
  readonly #lent: (() => void)[] = [];
  readonly portraits: Scene["portraits"];

  constructor(device: EarthDevice & FlightScene & Pick<PortraitDevice, "renderer">, owner: Disposer, came: () => void) {
    const { renderer, base, halved, moved } = device;
    const portrait = {
      renderer,
      base,
      halved,
      signal: owner.signal,
      lend: (draw: () => void) => {
        this.#lent.push(draw);
        moved();
      },
    };
    this.portraits = (ids, size, signal) =>
      import("./portraits.ts").then(({ portraitsFor }) => portraitsFor(portrait, ids, { size, signal }));
    this.cosmos = new CosmosPart(device, owner, came);
    this.world = new WorldDoor(device, owner, came);
    this.flights = new Door(
      () =>
        import("./flight/flights.ts").then(
          ({ flightsOn }) =>
            () =>
              flightsOn(device, this.cosmos),
        ),
      owner,
      { came: () => undefined },
    );
    this.flights.open();
  }

  /** Flies to `goal`, bound: the scene hands it on as its own. */
  readonly fly = (goal: FlightGoal): void => {
    this.flights.part?.fly(goal);
  };

  resize(width: number, height: number, ratio: number): void {
    this.cosmos.door.part?.resize(height, ratio);
    this.world.door.part?.resize(width, height, ratio);
  }

  /** The cosmos moves with the eye, and its dive by the scene's clock, which runs under reduced motion too (7d7); a world's page turns
   * by it. */
  tick({ worlds, seconds }: { readonly worlds: Point; readonly seconds: number }, clock: number): void {
    for (let at = 0; at < this.#lent.length; at += 1) this.#lent[at]?.();
    this.#lent.length = 0;
    this.world.door.part?.tick(clock);
    this.cosmos.door.part?.tick(worlds, seconds, clock);
  }

  restored(): void {
    this.cosmos.door.part?.restored();
    this.world.door.part?.restored();
  }

  stats() {
    return {
      cosmos: this.cosmos.door.part?.stats(),
      world: this.world.door.part?.stats(),
      flight: this.flights.part?.stats(),
    };
  }
}
