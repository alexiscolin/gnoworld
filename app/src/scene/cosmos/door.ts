// The cosmos's door in the scene: its chunk comes when a page first asks for worlds, so the Earth's page and a bare space never pay for it.
// One that does not come leaves the scenery as it is. What is asked before it comes waits here.
import type { ClearBox, Point } from "@gnoworld/core";
import type { Disposer } from "../disposer.ts";
import type { EarthDevice } from "../earth/device.ts";
import type { Cosmos, CosmosWorld } from "./cosmos.ts";

const loadCosmos = () => import("./cosmos.ts");

export class CosmosDoor {
  readonly #device: EarthDevice;
  readonly #owner: Disposer;
  readonly #came: () => void;
  #cosmos: Cosmos | undefined;
  #worlds: readonly CosmosWorld[] | undefined;
  #box: ClearBox | undefined;
  #asked = false;

  constructor(device: EarthDevice, owner: Disposer, came: () => void) {
    this.#device = device;
    this.#owner = owner;
    this.#came = came;
  }

  show(worlds: readonly CosmosWorld[] | undefined): void {
    this.#worlds = worlds;
    this.#cosmos?.show(worlds);
    if (worlds !== undefined && !this.#asked) this.#bring();
  }

  #bring(): void {
    this.#asked = true;
    loadCosmos().then(
      ({ Cosmos: Loaded }) => {
        if (this.#owner.signal.aborted) return;
        this.#cosmos = this.#owner.add(new Loaded(this.#device));
        this.#cosmos.keepClear(this.#box);
        this.#cosmos.show(this.#worlds);
        this.#came();
      },
      () => undefined,
    );
  }

  keepClear(box: ClearBox | undefined): void {
    this.#box = box;
    this.#cosmos?.keepClear(box);
  }

  resize(height: number, ratio: number): void {
    this.#cosmos?.resize(height, ratio);
  }

  tick(eye: Point, seconds: number, resting?: Point): void {
    this.#cosmos?.tick(eye, seconds, resting);
  }

  restored(): void {
    this.#cosmos?.restored();
  }

  stats(): ReturnType<Cosmos["stats"]> | undefined {
    return this.#cosmos?.stats();
  }
}
