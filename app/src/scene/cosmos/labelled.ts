// The cosmos's labels, the lazy chunk's way in (7h): a look asks core which worlds to label from what the view draws and what the data says,
// and hands each label what it points at: the Earth, a body, a distant star. A frame moves them.
import { chooseLabels, EARTH_RADIUS, type Drawn, type Point, type StarSystem } from "@gnoworld/core";
import { Vector3, type Group } from "three";
import type { CosmosWorld, LabelSignals } from "./cosmosWorld.ts";
import { asksOf } from "./labelAsks.ts";
import { Labels, type Anchor, type Chosen, type Projector } from "./labels.ts";

/** What the labels read of the cosmos: its bodies' projection and objects, and where its Earth stands. */
export interface Seen {
  readonly projector: Projector & { anchorOf: (id: string) => Group | undefined };
  readonly earth: () => Vector3 | undefined;
}

// Where nothing stands: the Earth's label waits there, hidden, until the globe has come.
const NOWHERE = new Vector3();

export class CosmosLabels {
  readonly #labels: Labels;
  readonly #seen: Seen;
  // The Earth's label stands by the globe wherever it is on each frame, and hides while it has not come: a look never waits for it.
  readonly #earth: Anchor;
  #list: readonly CosmosWorld[] = [];
  #signals: LabelSignals | undefined;

  constructor(document: Document, seen: Seen) {
    this.#seen = seen;
    this.#labels = new Labels(document, seen.projector);
    // The journeys read where each label stands, in a test build; a production build holds no trace of it.
    if (import.meta.env.VITE_GNOWORLD_TEST_GPU === "1") Reflect.set(globalThis, "__gnoworldLabels", this.#labels);
    this.#earth = {
      get position() {
        return seen.earth() ?? NOWHERE;
      },
      scale: { x: EARTH_RADIUS },
      get visible() {
        return seen.earth() !== undefined;
      },
    };
  }

  /** The file's worlds, and what is known of them now; none takes every label off with the cosmos. */
  list(worlds: readonly CosmosWorld[] | undefined, signals: LabelSignals | undefined): void {
    this.#list = worlds ?? [];
    this.#signals = signals;
    if (worlds === undefined) this.#labels.tick(NOWHERE, false);
  }

  /** A look: the systems, what the ladder drew, and the ids of the bodies the view stands. */
  look(systems: readonly StarSystem[], drawn: Drawn, bodies: Iterable<string>): void {
    const anchors = new Map<string, Anchor>([["earth", this.#earth]]);
    for (const id of bodies) {
      const body = this.#seen.projector.anchorOf(id);
      if (body !== undefined) anchors.set(id, body);
    }
    const near = [...anchors].flatMap(([id, { position }]) =>
      id === "earth" ? [] : [{ id, away: position.length() }],
    );
    const { asks, stars } = asksOf({ systems, drawn, bodies: near, list: this.#list, signals: this.#signals });
    const chosen = chooseLabels(asks).flatMap((label): Chosen[] => {
      const at: Anchor | Point | undefined = anchors.get(label.id) ?? stars.get(label.id);
      return at === undefined ? [] : [{ label, at }];
    });
    this.#labels.show(chosen, [...anchors.values()]);
  }

  tick(eye: Point, shown: boolean): void {
    this.#labels.tick(eye, shown);
  }

  dispose(): void {
    this.#labels.dispose();
  }
}
