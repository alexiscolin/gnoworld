// What a world's page reads of its world (ADR-0002 §3 and §10), each sign from its own data: the people present are its heat and its lights,
// its realms' calls its aurora, its rooms' lines its storms, the worlds' file its matter. Today's use stands in for the vitality, for nothing
// stores one yet (the chief's decision, 2026-11-02). A file of another universe is no file.
import {
  daysSince,
  isFresh,
  planetSeed,
  presenceOf,
  referenceOf,
  scaleOf,
  stormsOf,
  useOf as weighUse,
  worldLook,
  worldPath,
  worldSigns,
  type PlanetLook,
  type WorldSigns,
} from "@gnoworld/core";
import type { Worlds } from "@gnoworld/schemas/indexer";
import { liveLight, perNamespace, universeOf, type Universe } from "../live.ts";

type FileWorld = Worlds["worlds"][number];

export interface WorldNow {
  /** The universe the page belongs to. */
  readonly universe: string;
  /** The world's id, as the worlds' job groups it. */
  readonly id: string;
  /** Distinct people in its rooms now. */
  readonly people: number;
  /** The times of its rooms' lines, in milliseconds. */
  readonly lines: readonly number[];
  /** Whether this reader came before. */
  readonly visited: boolean;
  readonly now: number;
}

export interface WorldReading {
  readonly look: PlanetLook;
  readonly signs: WorldSigns;
  /** The signs once a seed has woken: the world it becomes. */
  readonly woken?: WorldSigns;
  readonly vitality: number;
  readonly heat: number;
  readonly aurora: number;
  readonly storms: readonly [number, number, number];
  /** This visit wakes a seed. */
  readonly wake: boolean;
  /** This visit is this reader's first to the world, whatever its age: its appearance plays. */
  readonly first: boolean;
  /** Its realms' use against its universe's, 0 to 1 on a log scale with no floor (F4307); none while the universe's file has no count. */
  readonly used?: number;
}

interface Weighed extends Universe {
  readonly use: { readonly social: number; readonly realm: number };
}

const realmUse = ({ realms }: FileWorld) => realms.reduce((sum, { callers }) => sum + (callers ?? 0), 0);

// The universe's weights, once a file: its percentile of use and of calls, and its newest call, the chain's height at the file's writing.
const weighed = new WeakMap<Worlds, Weighed>();
function weigh(file: Worlds): Weighed {
  const known = weighed.get(file);
  if (known !== undefined) return known;
  const use = referenceOf(perNamespace(file.worlds, realmUse).map((realm) => ({ social: 0, realm })));
  const made = { use, ...universeOf(file) };
  weighed.set(file, made);
  return made;
}

// Whether a universe's file carries any count: the job writes none for a chain it could not read, and quiet is then not known.
const counted = (file: Worlds) => file.worlds.some(({ realms }) => realms.some(({ callers }) => callers !== null));

// The world's realms' use against its universe's percentile; none from no file, another universe's, or one with no count.
function usedIn(file: Worlds | undefined, at: WorldNow, found: ReturnType<typeof inFile>): number | undefined {
  if (file?.universe !== at.universe || !counted(file)) return undefined;
  return scaleOf(found.ours === undefined ? 0 : realmUse(found.world), found.weights?.use.realm ?? 0);
}

// The world as the file has it, weighed against its universe: none from a file of another universe, or from no file.
function inFile(file: Worlds | undefined, at: WorldNow) {
  const ours = file?.universe === at.universe ? file : undefined;
  const world = ours?.worlds.find(({ id }) => id === at.id);
  return ours === undefined || world === undefined
    ? { weights: ours === undefined ? undefined : weigh(ours) }
    : { ours, world, weights: weigh(ours) };
}

const auroraIn = (found: ReturnType<typeof inFile>, now: number): number =>
  found.ours === undefined ? 0 : liveLight(found.world, found.weights, now);

/** What `at` reads of its world in `file`. */
export function readingOf(file: Worlds | undefined, at: WorldNow): WorldReading {
  const found = inFile(file, at);
  const reference = found.weights?.use ?? { social: 0, realm: 0 };
  const vitality = weighUse(
    { social: at.people, realm: found.ours === undefined ? 0 : realmUse(found.world) },
    reference,
  );
  const heat = presenceOf(at.people, 0);
  const fresh = isFresh(daysSince(found.ours === undefined ? undefined : found.world.seen, at.now), at.visited);
  const look = worldLook(at.id);
  const seed = planetSeed(worldPath(at.id));
  const state = { vitality, present: heat, fresh };
  const used = usedIn(file, at, found);
  return {
    look,
    signs: worldSigns(seed, look.anchor, state),
    ...(fresh ? { woken: worldSigns(seed, look.anchor, { ...state, fresh: false }) } : {}),
    vitality,
    heat,
    aurora: auroraIn(found, at.now),
    storms: stormsOf(at.lines, at.now),
    wake: fresh,
    first: !at.visited,
    ...(used === undefined ? {} : { used }),
  };
}
