// What the page knows of the scene's flights (7g): where space showed last, so a page that moves from one place in space to another asks
// the scene to fly there before it is told of the next, its flight copying what is still drawn; and what the flight panel shows, as the
// scene says it, which it tells whoever the page has listening. No React: the panel reads it as the universe reads the host.
import type { FlightGoal, FlightSaid } from "../../scene/flight/flights.ts";
import type { Scene } from "../../scene/scene.ts";

// The Earth's page, the cosmos, or a world's, by its id and its name.
type Place = "earth" | "cosmos" | { readonly world: string; readonly name?: string };

// A world by its name, the Earth, the cosmos: where a flight goes, and what the panel calls it.
const goalOf = (place: Place): FlightGoal =>
  typeof place === "object"
    ? { kind: "body", name: place.name ?? place.world }
    : place === "earth"
      ? { kind: "body", name: "Earth" }
      : { kind: "cosmos", name: "Cosmos" };

const same = (a: Place, b: Place) => (typeof a === "object" && typeof b === "object" ? a.world === b.world : a === b);

export class Flown {
  readonly #told: () => void;
  #at: Place | undefined;
  // The place a page just left: the next page, in the same task, flies from it.
  #left: Place | undefined;
  #flight: FlightSaid | undefined;

  /** `told`, each time what the panel shows changes. */
  constructor(told: () => void) {
    this.#told = told;
  }

  /** What the panel shows of a flight under way. */
  readonly flight = () => this.#flight;

  /** The scene says how its flight goes, ten times a second at most; nothing once it landed. */
  readonly said = (flight: FlightSaid | undefined): void => {
    this.#flight = flight === undefined ? undefined : { ...flight };
    this.#told();
  };

  /** The page shows `shown` next, on `scene` if it runs: from another place in space, a flight there. A page that leaves covers space as it
   * goes, and the next asks for its place in the same task: the frame the first showed is copied as it leaves, and the flight starts there.
   * A page that stays covered, flies from nowhere. */
  between(scene: Scene | undefined, shown: boolean | Place): void {
    const [from, at] = [this.#at ?? this.#left, typeof shown === "boolean" ? undefined : shown];
    if (at === undefined && this.#at !== undefined) {
      this.#left = this.#at;
      scene?.depart();
      queueMicrotask(() => {
        this.#left = undefined;
      });
    }
    this.#at = at;
    if (scene !== undefined && from !== undefined && at !== undefined && !same(from, at)) scene.fly(goalOf(at));
  }
}
