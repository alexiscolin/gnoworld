// What the realism page is asked to show: a view, a world, a seed, a stage. Its worlds' paths are made up, and so are their gauges: no world
// has real ones yet, so each stage stands for one state, its crowd a stage's usual one.
import {
  ANCHORS,
  asciiBytes,
  planetLook,
  planetSeed,
  STAGES,
  worldSigns,
  type PlanetLook,
  type Stage,
  type WorldSigns,
  type WorldState,
} from "@gnoworld/core";

export type ViewName = "gallery" | "close" | "eclipse" | "nebula" | "earth" | "stages";
export type Method = "computed" | "image";

export interface Choice {
  readonly view: ViewName;
  readonly world: number;
  readonly seed: number;
  readonly method: Method;
  readonly stage: Stage;
  /** The people here, in place of a stage's usual crowd. */
  readonly present: number | null;
}

const NAMES = [
  "atlas",
  "harbor",
  "ember",
  "tide",
  "glacier",
  "forge",
  "bubble",
  "kelvin",
  "veil",
  "dusk",
  "soot",
  "shard",
  "plume",
  "groove",
  "frost",
  "deep",
  "dawn",
  "magma",
  "janus",
  "pearl",
  "azure",
  "coal",
  "kiln",
  "mist",
];
const STATES: Record<Stage, WorldState> = {
  seed: { vitality: 0.1, present: 0.3, fresh: true },
  rest: { vitality: 0.1, present: 0, fresh: false },
  living: { vitality: 0.42, present: 0.2, fresh: false },
  inhabited: { vitality: 0.62, present: 0.4, fresh: false },
  busy: { vitality: 0.8, present: 0.65, fresh: false },
  beacon: { vitality: 0.95, present: 0.9, fresh: false },
};

/** The path of a world on the page: another seed, another world of the same anchor. */
export const pathOf = (world: number, seed: number): string =>
  `gno.land/r/${NAMES[world] ?? "atlas"}${seed === 0 ? "" : String(seed)}/home`;

/** The bytes of a choice's `index`th world. */
export const pathBytes = ({ view, world, seed }: Choice, index: number): Uint8Array =>
  asciiBytes(pathOf(view === "gallery" ? index : world, seed));

/** The look of the page's `world`th anchor. */
const lookAt = (world: number, seed: number): PlanetLook =>
  planetLook(asciiBytes(pathOf(world, seed)), ANCHORS[world] ?? "rocky");

/** The looks a choice shows. */
export function looksOf({ view, world, seed }: Choice): PlanetLook[] {
  if (view === "gallery") return ANCHORS.map((_, index) => lookAt(index, seed));
  return view === "stages" ? STAGES.map(() => lookAt(world, seed)) : [lookAt(world, seed)];
}

/** What each world of a choice shows: one stage in every view, all six in their own. */
export const signsOf = (choice: Choice, looks: readonly PlanetLook[]): WorldSigns[] =>
  looks.map(({ anchor }, index) => {
    const state = STATES[choice.view === "stages" ? (STAGES[index] ?? "rest") : choice.stage];
    return worldSigns(planetSeed(pathBytes(choice, index)), anchor, {
      ...state,
      present: choice.present ?? state.present,
    });
  });
