// The scene's parts behind chunks of their own, the cosmos and a world's page (door.ts), and what was asked of each before it came: a page
// asks at once, the part comes when its chunk does, and is told the last thing asked.
import type { ClearBox, Point } from "@gnoworld/core";
import type { Cosmos } from "./cosmos/cosmos.ts";
import type { CosmosWorld, LabelSignals } from "./cosmos/cosmosWorld.ts";
import type { Disposer } from "./disposer.ts";
import { Door } from "./door.ts";
import type { EarthDevice } from "./earth/device.ts";
import type { MoonMark, WorldAsk, WorldPart, WorldSaid } from "./world/part.ts";

export class CosmosPart {
  readonly door: Door<Cosmos>;
  #worlds: readonly CosmosWorld[] | undefined;
  #written: string | undefined;
  #signals: LabelSignals | undefined;
  #box: ClearBox | undefined;

  constructor(device: EarthDevice, owner: Disposer, came: () => void) {
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
          cosmos.keepClear(this.#box);
          this.#tell(cosmos);
          came();
        },
      },
    );
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

/** Both, as the scene sizes, moves, restores and reads them. */
export class Parts {
  readonly cosmos: CosmosPart;
  readonly world: WorldDoor;

  constructor(device: EarthDevice, owner: Disposer, came: () => void) {
    this.cosmos = new CosmosPart(device, owner, came);
    this.world = new WorldDoor(device, owner, came);
  }

  resize(width: number, height: number, ratio: number): void {
    this.cosmos.door.part?.resize(height, ratio);
    this.world.door.part?.resize(width, height, ratio);
  }

  /** The cosmos moves with the eye and rests where the view rests (its glide apart, 7d6); a world's page turns by the scene's clock. */
  tick(
    { worlds, seconds, resting }: { readonly worlds: Point; readonly seconds: number; readonly resting: Point },
    clock: number,
  ): void {
    this.world.door.part?.tick(clock);
    this.cosmos.door.part?.tick(worlds, seconds, resting);
  }

  restored(): void {
    this.cosmos.door.part?.restored();
    this.world.door.part?.restored();
  }

  stats() {
    return { cosmos: this.cosmos.door.part?.stats(), world: this.world.door.part?.stats() };
  }
}
