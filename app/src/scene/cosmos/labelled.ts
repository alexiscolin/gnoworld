// The cosmos's labels, the lazy chunk's way in (7h): a look asks core which worlds to label from what the view draws and what the data says,
// and hands each label what it points at: the Earth, a body, a distant star. A frame moves them. The home's rocks come through here too
// (7p), and a Plan's ellipses and names (7v), the one chunk a look and a frame reach that the cosmos's and the scene's chunks pay nothing for.
import { chooseLabels, type Drawn, type Planned, type Point, type Rock, type StarSystem } from "@gnoworld/core";
import { Vector3, type Group } from "three";
import type { CosmosWorld, LabelSignals } from "./cosmosWorld.ts";
import { asksOf } from "./labelAsks.ts";
import { Labels, type Anchor, type Chosen, type Projector } from "./labels.ts";

/** What the labels read of the cosmos: its bodies' projection, objects and group, and where its Earth stands. */
export interface Seen {
  readonly projector: Projector & { anchorOf: (id: string) => Group | undefined; group?: Group };
  readonly earth: () => Vector3 | undefined;
  /** The Earth's radius, handed by the cosmos: this chunk imports nothing that lives with it. */
  readonly earthRadius: number;
}

// Where nothing stands: the Earth's label waits there, hidden, until the globe has come.
const NOWHERE = new Vector3();
// The home's rocks are drawn by a chunk of their own, asked the first time a look lays some; so is a Plan, the first time a look holds one.
const loadRocks = () => import("./rocks.ts");
type Rocks = InstanceType<Awaited<ReturnType<typeof loadRocks>>["Rocks"]>;
const loadOrbits = () => import("./orbits.ts");
type Orbits = InstanceType<Awaited<ReturnType<typeof loadOrbits>>["Orbits"]>;

export class CosmosLabels {
  readonly #labels: Labels;
  readonly #seen: Seen;
  // The Earth's label stands by the globe wherever it is on each frame, and hides while it has not come: a look never waits for it.
  readonly #earth: Anchor;
  #list: readonly CosmosWorld[] = [];
  #signals: LabelSignals | undefined;
  #rocks: Rocks | undefined;
  #laid: readonly Rock[] = [];
  #asked = false;
  #gone = false;
  #orbits: Orbits | undefined;
  #plan: Planned | undefined;
  #askedOrbits = false;

  constructor(document: Document, seen: Seen) {
    this.#seen = seen;
    this.#labels = new Labels(document, seen.projector);
    // The journeys read where each label stands, in a test build; a production build holds no trace of it.
    if (import.meta.env.VITE_GNOWORLD_TEST_GPU === "1") Reflect.set(globalThis, "__gnoworldLabels", this.#labels);
    this.#earth = {
      get position() {
        return seen.earth() ?? NOWHERE;
      },
      scale: { x: seen.earthRadius },
      get visible() {
        return seen.earth() !== undefined;
      },
    };
  }

  /** The file's worlds, and what is known of them now; none takes every label off with the cosmos. */
  list(worlds: readonly CosmosWorld[] | undefined, signals: LabelSignals | undefined): void {
    this.#list = worlds ?? [];
    this.#signals = signals;
    if (worlds !== undefined) return;
    // The cosmos goes: its labels and its Plan's names with it (7v's review).
    this.#labels.tick(NOWHERE, false);
    this.#plan = undefined;
    this.#orbits?.show(undefined, { worlds: [], signals: undefined });
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
    const { asks, stars } = asksOf({
      systems,
      drawn,
      bodies: near,
      list: this.#list,
      signals: this.#signals,
    });
    const chosen = chooseLabels(asks).flatMap((label): Chosen[] => {
      const at: Anchor | Point | undefined = anchors.get(label.id) ?? stars.get(label.id);
      return at === undefined ? [] : [{ label, at }];
    });
    // A Plan names each of its worlds under it: no pill beside them.
    this.#labels.show(drawn.plan === undefined ? chosen : [], [...anchors.values()]);
    this.#lay(drawn.rocks ?? []);
    this.#showPlan(drawn.plan);
  }

  // A Plan, drawn with the file's words by its chunk, asked the first time a look holds one.
  #showPlan(plan: Planned | undefined): void {
    this.#plan = plan;
    this.#orbits?.show(plan, { worlds: this.#list, signals: this.#signals });
    if (this.#askedOrbits || plan === undefined) return;
    this.#askedOrbits = true;
    loadOrbits().then(
      ({ Orbits: Made }) => {
        const { group } = this.#seen.projector;
        if (this.#gone || group === undefined) return;
        this.#orbits = new Made(group, document, { projector: this.#seen.projector });
        this.#orbits.show(this.#plan, { worlds: this.#list, signals: this.#signals });
      },
      () => undefined,
    );
  }

  // The rocks a look laid, among the bodies, so they show and hide with them; a chunk that does not come leaves none.
  #lay(rocks: readonly Rock[]): void {
    this.#laid = rocks;
    this.#rocks?.lay(rocks);
    if (this.#asked || rocks.length === 0) return;
    this.#asked = true;
    loadRocks().then(
      ({ Rocks: Made }) => {
        const { group } = this.#seen.projector;
        if (this.#gone || group === undefined) return;
        this.#rocks = new Made(group);
        this.#rocks.lay(this.#laid);
      },
      () => undefined,
    );
  }

  tick(eye: Point, shown: boolean): void {
    this.#labels.tick(eye, shown);
    this.#rocks?.tick(eye);
    this.#orbits?.tick(eye, shown);
  }

  dispose(): void {
    this.#gone = true;
    this.#labels.dispose();
    this.#rocks?.dispose();
    this.#orbits?.dispose();
  }
}
