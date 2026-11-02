// The cosmos's labels (7h) behind a chunk of their own, asked at the cosmos's first look: until it comes, and if it never does, the cosmos
// draws with no label. What was asked meanwhile is handed on as it arrives.
import type { Point } from "@gnoworld/core";
import type { Disposer } from "../disposer.ts";
import type { CosmosWorld, LabelSignals } from "./cosmosWorld.ts";
import type { CosmosLabels, Seen } from "./labelled.ts";

type Look = Parameters<CosmosLabels["look"]>;

export class LazyLabels {
  readonly #seen: Seen;
  #part: CosmosLabels | undefined;
  #gone = false;
  #list: readonly CosmosWorld[] | undefined;
  #signals: LabelSignals | undefined;
  #look: Look | undefined;

  constructor(owner: Disposer, seen: Seen) {
    this.#seen = seen;
    owner.add({
      dispose: () => {
        this.#gone = true;
        this.#part?.dispose();
      },
    });
  }

  /** The file's worlds, and what is known of them now, or none: the cosmos has left the stage, and its labels with it. */
  list(worlds: readonly CosmosWorld[] | undefined, signals?: LabelSignals): void {
    this.#list = worlds;
    if (signals !== undefined) this.#signals = signals;
    this.#part?.list(worlds, this.#signals);
  }

  look(...look: Look): void {
    const asked = this.#look !== undefined;
    this.#look = look;
    if (this.#part !== undefined) this.#part.look(...look);
    else if (!asked) this.#ask();
  }

  // A chunk that does not come, or a page with no document, leaves the cosmos with no label.
  #ask(): void {
    import("./labelled.ts")
      .then((loaded) => new loaded.CosmosLabels(document, this.#seen))
      .then(
        (part) => {
          if (this.#gone) part.dispose();
          else this.#arrived(part);
        },
        () => undefined,
      );
  }

  #arrived(part: CosmosLabels): void {
    this.#part = part;
    part.list(this.#list, this.#signals);
    if (this.#look !== undefined) part.look(...this.#look);
  }

  tick(eye: Point, shown: boolean): void {
    this.#part?.tick(eye, shown);
  }

  stats() {
    return this.#part?.stats();
  }
}
