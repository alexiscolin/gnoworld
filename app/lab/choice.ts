// What the realism page is asked to show: a view, a world, a seed, a stage. Its anchors' worlds have made-up paths, its real ones the
// recorded file's; no world has real gauges yet, so each stage stands for one state, its crowd a stage's usual one.
import {
  ANCHORS,
  asciiBytes,
  planetLook,
  planetRecipe,
  planetSeed,
  STAGES,
  worldLook,
  worldPath,
  worldRecipe,
  worldSigns,
  type Anchor,
  type Recipe,
  type Stage,
  type WorldSigns,
  type WorldState,
} from "@gnoworld/core";
import { Worlds } from "@gnoworld/schemas/indexer";
import type { World } from "../src/scene/planet/generated.ts";
import recorded from "./worlds.json" with { type: "json" };

export type ViewName =
  "gallery" | "gallery24" | "real24" | "class24" | "variety" | "close" | "eclipse" | "earth" | "stages";
export type Tier = "high" | "low";

export interface Choice {
  readonly view: ViewName;
  readonly world: number;
  readonly seed: number;
  readonly stage: Stage;
  /** The people here, in place of a stage's usual crowd. */
  readonly present: number | null;
  /** A world of the recorded file's 24, seen close in place of an anchor's. */
  readonly real: number | null;
  /** Off, every minor class is taken out: what the journeys hold a world's own class to. */
  readonly minor: boolean;
  /** On, every real map is a grey: what a world owes its maps, which must be detail alone. */
  readonly flat: boolean;
}

/** A world on the page: where its seed is read from, how it looks, and the id it has in the recorded file. */
export interface Shown extends World {
  readonly path: Uint8Array;
  readonly id: string | null;
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
// The gallery Alexis approved shows ADR-0002 §3's twelve; a view of 24 the rest. The variety view: eight classes of every kind.
const TWELVE = 12;
const MANY = 24;
const VARIETY: readonly Anchor[] = [
  "rocky",
  "temperate",
  "desert",
  "ice",
  "volcanic",
  "gas giant",
  "ice giant",
  "cloud deck",
];

/** The path of a world on the page: another seed, another world of the same anchor. */
export const pathOf = (world: number, seed: number): string =>
  `gno.land/r/${NAMES[world] ?? "atlas"}${seed === 0 ? "" : String(seed)}/home`;

// A recipe as the choice shows it: with its minor class, or with none.
const minorIn = (recipe: Recipe, minor: boolean): Recipe => (minor ? recipe : { ...recipe, minorShare: 0 });

const madeUp = (index: number, anchor: Anchor, { seed, minor }: Pick<Choice, "seed" | "minor">): Shown => {
  const path = asciiBytes(pathOf(index, seed));
  return { path, id: null, look: planetLook(path, anchor), recipe: minorIn(planetRecipe(path, anchor), minor) };
};

// The recorded file's worlds in an order of the seed's own, so another seed shows another 24.
function recordedWorlds(seed: number): Recorded[] {
  const order = (id: string) => Array.from(planetSeed(asciiBytes(`${String(seed)}:${id}`)).subarray(0, 4)).join(".");
  return Worlds.parse(recorded)
    .worlds.map((world) => ({ id: world.id, nature: world.nature ?? null, key: order(world.id) }))
    .sort((one, other) => (one.key < other.key ? -1 : one.key > other.key ? 1 : 0))
    .slice(0, MANY);
}

interface Recorded {
  readonly id: string;
  readonly nature: Parameters<typeof worldLook>[1];
}
const real = ({ id, nature }: Recorded, minor: boolean): Shown => ({
  path: worldPath(id),
  id,
  look: worldLook(id, nature),
  recipe: minorIn(worldRecipe(id, nature), minor),
});

// The views of many made-up worlds, each its own path: ADR-0002 §3's twelve, all 24, one class 24 times, eight classes.
function manyOf(choice: Choice): Shown[] | undefined {
  const { view, world } = choice;
  if (view === "gallery") return ANCHORS.slice(0, TWELVE).map((each, at) => madeUp(at, each, choice));
  if (view === "gallery24") return ANCHORS.map((each, at) => madeUp(at, each, choice));
  if (view === "class24") return NAMES.map((_, at) => madeUp(at, ANCHORS[world] ?? "rocky", choice));
  if (view === "variety") return VARIETY.map((each, at) => madeUp(at, each, choice));
  return undefined;
}

/** The worlds a choice shows. */
export function worldsOf(choice: Choice): Shown[] {
  const many = manyOf(choice);
  if (many !== undefined) return many;
  const { view, world, seed, real: index, minor } = choice;
  const recordedAll = view === "real24" || index !== null ? recordedWorlds(seed) : [];
  if (view === "real24") return recordedAll.map((each) => real(each, minor));
  const one = index === null ? undefined : recordedAll[index];
  const shown = one === undefined ? madeUp(world, ANCHORS[world] ?? "rocky", choice) : real(one, minor);
  return view === "stages" ? STAGES.map(() => shown) : [shown];
}

/** What each world of a choice shows: one stage in every view, all six in their own. */
export const signsOf = (choice: Choice, worlds: readonly Shown[]): WorldSigns[] =>
  worlds.map(({ look, path }, index) => {
    const state = STATES[choice.view === "stages" ? (STAGES[index] ?? "rest") : choice.stage];
    return worldSigns(planetSeed(path), look.anchor, { ...state, present: choice.present ?? state.present });
  });
