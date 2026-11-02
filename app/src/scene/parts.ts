// The scene's parts behind chunks of their own, the cosmos for now (door.ts), and what was asked of each before it came: a page asks at
// once, the part comes when its chunk does, and is told the last thing asked.
import type { ClearBox, Point } from "@gnoworld/core";
import type { Cosmos, CosmosWorld } from "./cosmos/cosmos.ts";
import type { Disposer } from "./disposer.ts";
import { Door } from "./door.ts";
import type { EarthDevice } from "./earth/device.ts";

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

/** All of them, as the scene sizes, moves, restores and reads them. */
export class Parts {
  readonly cosmos: CosmosPart;

  constructor(device: EarthDevice, owner: Disposer, came: () => void) {
    this.cosmos = new CosmosPart(device, owner, came);
  }

  resize(_width: number, height: number, ratio: number): void {
    this.cosmos.door.part?.resize(height, ratio);
  }

  tick(eye: Point, seconds: number): void {
    this.cosmos.door.part?.tick(eye, seconds);
  }

  restored(): void {
    this.cosmos.door.part?.restored();
  }

  stats() {
    return { cosmos: this.cosmos.door.part?.stats() };
  }
}
