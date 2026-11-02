// What a world's page reads of its world (ADR-0002 §3 and §10), each sign from its own data: the people present are its heat and its lights,
// its realms' calls its aurora, its rooms' lines its storms, the worlds' file its matter. Today's use stands in for the vitality, for nothing
// stores one yet (the chief's decision, 2026-11-02). A file of another universe is no file.
import {
  asciiBytes,
  auroraOf,
  BLOCK_MS,
  isFresh,
  planetSeed,
  presenceOf,
  referenceOf,
  stormsOf,
  useOf as weighUse,
  worldLook,
  worldSigns,
  type PlanetLook,
  type WorldSigns,
} from "@gnoworld/core";
import type { Worlds } from "@gnoworld/schemas/indexer";

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
}

interface Weighed {
  readonly use: { readonly social: number; readonly realm: number };
  readonly calls: number;
  readonly newest: number | null;
}

const DAY = 86_400_000;
const WORLD_PATH = "gno.land/r/";

const realmUse = ({ realms }: FileWorld) => realms.reduce((sum, { callers }) => sum + (callers ?? 0), 0);
const callsOf = ({ realms }: FileWorld) =>
  realms.some(({ calls }) => calls !== null) ? realms.reduce((sum, { calls }) => sum + (calls ?? 0), 0) : null;
const lastOf = ({ realms }: FileWorld) =>
  realms.reduce<number | null>(
    (last, { lastHeight }) => (lastHeight === null ? last : Math.max(last ?? 0, lastHeight)),
    null,
  );

// The universe's weights, once a file: its percentile of use and of calls, and its newest call, the chain's height at the file's writing.
const weighed = new WeakMap<Worlds, Weighed>();
function weigh(file: Worlds): Weighed {
  const known = weighed.get(file);
  if (known !== undefined) return known;
  const use = referenceOf(file.worlds.map((world) => ({ social: 0, realm: realmUse(world) })));
  const calls = referenceOf(file.worlds.map((world) => ({ social: 0, realm: callsOf(world) ?? 0 }))).realm;
  const newest = file.worlds.reduce<number | null>((top, world) => {
    const last = lastOf(world);
    return last === null ? top : Math.max(top ?? 0, last);
  }, null);
  const made = { use, calls, newest };
  weighed.set(file, made);
  return made;
}

// The chain's height now, as far as the file tells: its newest call, plus the blocks since it was written.
function heightNow(file: Worlds, newest: number | null, now: number): number | null {
  const written = Date.parse(file.updated);
  return newest === null || !Number.isFinite(written) ? null : newest + Math.max(now - written, 0) / BLOCK_MS;
}

// How many days ago the file first saw the world; none when it never did, or says a time to come.
function ageOf(world: FileWorld | undefined, now: number): number | null {
  const seen = typeof world?.seen === "string" ? Date.parse(world.seen) : Number.NaN;
  return Number.isFinite(seen) && seen <= now ? (now - seen) / DAY : null;
}

// The world as the file has it, weighed against its universe: none from a file of another universe, or from no file.
function inFile(file: Worlds | undefined, at: WorldNow) {
  const ours = file?.universe === at.universe ? file : undefined;
  const world = ours?.worlds.find(({ id }) => id === at.id);
  return ours === undefined || world === undefined
    ? { weights: ours === undefined ? undefined : weigh(ours) }
    : { ours, world, weights: weigh(ours) };
}

function auroraIn(found: ReturnType<typeof inFile>, now: number): number {
  if (found.ours === undefined) return 0;
  const { ours, world, weights } = found;
  return auroraOf(
    { calls: callsOf(world), lastHeight: lastOf(world) },
    heightNow(ours, weights.newest, now),
    weights.calls,
  );
}

/** What `at` reads of its world in `file`. */
export function readingOf(file: Worlds | undefined, at: WorldNow): WorldReading {
  const found = inFile(file, at);
  const reference = found.weights?.use ?? { social: 0, realm: 0 };
  const vitality = weighUse(
    { social: at.people, realm: found.ours === undefined ? 0 : realmUse(found.world) },
    reference,
  );
  const heat = presenceOf(at.people, 0);
  const fresh = isFresh(ageOf(found.ours === undefined ? undefined : found.world, at.now), at.visited);
  const look = worldLook(at.id);
  const seed = planetSeed(asciiBytes(`${WORLD_PATH}${at.id}`));
  const state = { vitality, present: heat, fresh };
  return {
    look,
    signs: worldSigns(seed, look.anchor, state),
    ...(fresh ? { woken: worldSigns(seed, look.anchor, { ...state, fresh: false }) } : {}),
    vitality,
    heat,
    aurora: auroraIn(found, at.now),
    storms: stormsOf(at.lines, at.now),
    wake: fresh,
  };
}
