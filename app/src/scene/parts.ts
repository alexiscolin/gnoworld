// The scene's parts behind chunks of their own, the cosmos and a world's page (door.ts), and what was asked of each before it came: a page
// asks at once, the part comes when its chunk does, and is told the last thing asked.
import type { ClearBox, Point } from "@gnoworld/core";
import type { Cosmos, CosmosWorld } from "./cosmos/cosmos.ts";
import type { Disposer } from "./disposer.ts";
import { Door } from "./door.ts";
import type { EarthDevice } from "./earth/device.ts";
import type { MoonMark, WorldAsk, WorldPart, WorldSaid } from "./world/part.ts";

export class CosmosPart {
  readonly door: Door<Cosmos>;
  #worlds: readonly CosmosWorld[] | undefined;
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
      (cosmos) => {
        cosmos.keepClear(this.#box);
        cosmos.show(this.#worlds);
        came();
      },
    );
  }

  show(worlds: readonly CosmosWorld[] | undefined): void {
    this.#worlds = worlds;
    this.door.part?.show(worlds);
    if (worlds !== undefined) this.door.open();
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
      (world) => {
        world.show(this.#asked, this.#said);
        world.moons(this.#marks);
        came();
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

  tick(eye: Point, seconds: number, clock: number): void {
    this.world.door.part?.tick(clock);
    this.cosmos.door.part?.tick(eye, seconds);
  }

  restored(): void {
    this.cosmos.door.part?.restored();
    this.world.door.part?.restored();
  }

  stats() {
    return { cosmos: this.cosmos.door.part?.stats(), world: this.world.door.part?.stats() };
  }
}
