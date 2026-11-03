// The flights' door (7g): their chunk, with camera-controls, asked as the scene starts, so the first flight finds it; one asked before it came,
// or if it never comes, is no flight, and the page changes as it did. Through it the scene tells a flight its page's body stood, and holds
// the loop's full rate while a flight or its crossfade runs. What the flights make of the scene's device is their chunk's.
import type { Disposer } from "./disposer.ts";
import { Door } from "./door.ts";
import type { CosmosSight, FlightGoal, Flights, FlightScene } from "./flight/flights.ts";

export type { FlightScene as FlightDoorDevice };

export class FlightDoor {
  readonly #door: Door<Flights>;

  /** On `device`, owned by `owner`; `cosmos`, as a flight reads it while it shows. */
  constructor(device: FlightScene, owner: Disposer, cosmos: { readonly sight: CosmosSight | undefined }) {
    this.#door = new Door(
      () =>
        import("./flight/flights.ts").then(
          ({ flightsOn }) =>
            () =>
              flightsOn(device, cosmos),
        ),
      owner,
      { came: () => undefined },
    );
    this.#door.open();
  }

  /** Whether a flight or its crossfade runs: the loop holds its full rate for it. */
  get busy(): boolean {
    return this.#door.part?.busy ?? false;
  }

  fly(goal: FlightGoal): void {
    this.#door.part?.fly(goal);
  }

  /** The page leaves its place: what is drawn now is kept for a flight from it. */
  depart(): void {
    this.#door.part?.depart();
  }

  /** The page's body stood. */
  ready(): void {
    this.#door.part?.ready();
  }

  /** One frame on, before the eye advances. */
  advance(delta: number): void {
    this.#door.part?.advance(delta);
  }

  land(): void {
    this.#door.part?.land();
  }

  stats() {
    return this.#door.part?.stats();
  }
}
