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
  scaleOf,
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
  /** Its realms' use against its universe's, 0 to 1 on a log scale with no floor (F4307); none while the universe's file has no count. */
  readonly used?: number;
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

// One count a namespace, its busiest world's: an owner who makes many worlds weighs as one (security review, S1).
function perNamespace(file: Worlds, count: (world: FileWorld) => number): number[] {
  const top = new Map<string, number>();
  for (const world of file.worlds) top.set(world.namespace, Math.max(top.get(world.namespace) ?? 0, count(world)));
  return [...top.values()];
}

// The universe's weights, once a file: its percentile of use and of calls, and its newest call, the chain's height at the file's writing.
const weighed = new WeakMap<Worlds, Weighed>();
function weigh(file: Worlds): Weighed {
  const known = weighed.get(file);
  if (known !== undefined) return known;
  const use = referenceOf(perNamespace(file, realmUse).map((realm) => ({ social: 0, realm })));
  const calls = referenceOf(
    perNamespace(file, (world) => callsOf(world) ?? 0).map((realm) => ({ social: 0, realm })),
  ).realm;
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
    ...(used === undefined ? {} : { used }),
  };
}
