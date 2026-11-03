// What a look asks labels for (slice 7, 7h): the Earth, the bodies the view draws, nearest first, and the worlds round the stars it draws that
// real data names: people here, a rise, callers the file counts, a new world this reader has not visited. A world nothing names asks for
// none: signs always mean real data (ADR-0002 §10).
import {
  daysSince,
  isFresh,
  known,
  type Drawn,
  type LabelAsk,
  type Point,
  type Signals,
  type StarSystem,
} from "@gnoworld/core";
import type { CosmosWorld, LabelSignals } from "./cosmosWorld.ts";

const NOTHING: LabelSignals = { present: new Map(), names: new Map(), visited: () => false, now: Number.NaN };

interface Look {
  readonly systems: readonly StarSystem[];
  readonly drawn: Drawn;
  /** The bodies the view draws, by id, and how far each stands from the eye. */
  readonly bodies: readonly { readonly id: string; readonly away: number }[];
  readonly list: readonly CosmosWorld[];
  readonly signals?: LabelSignals | undefined;
  /** The callers the file counts in a world's realms, handed by the cosmos: this chunk imports nothing that lives with it. */
  readonly callersOf: (world: CosmosWorld) => number;
}

// What a look reads its worlds with: the signals, and how a world's callers are counted.
interface Reading {
  readonly signals: LabelSignals;
  readonly callersOf: Look["callersOf"];
}

type Heard = LabelSignals["present"] extends ReadonlyMap<string, infer Count> ? Count : never;
const heardOf = (here: Heard | undefined): Signals =>
  here === undefined
    ? {}
    : { here: here.here, perHour: here.perHour, ...(here.rise === null ? {} : { rise: here.rise }) };

function signalsOf(world: CosmosWorld | undefined, id: string, { signals, callersOf }: Reading): Signals {
  const { present, visited, now } = signals;
  const use = world === undefined ? 0 : callersOf(world);
  // This reader's visits are read only of a world under seven days old: an older one is never uncharted.
  const uncharted = isFresh(daysSince(world?.seen, now), false) && !visited(id);
  return { ...heardOf(present.get(id)), ...(use > 0 ? { use } : {}), ...(uncharted ? { uncharted: true } : {}) };
}

type Known = Map<string, [CosmosWorld, Signals][]>;
// The worlds data names, by namespace.
function knownIn(list: readonly CosmosWorld[], reading: Reading): Known {
  const named: Known = new Map();
  for (const world of list) {
    const said = signalsOf(world, world.id, reading);
    const group = named.get(world.namespace);
    if (!known(said)) continue;
    if (group === undefined) named.set(world.namespace, [[world, said]]);
    else group.push([world, said]);
  }
  return named;
}

// Kept once a file: its worlds by id, and for each signals the worlds data names; a look then reads only those round the stars it draws.
// ponytail: a pass over the file each time it or the signals change, 20,000 worlds at most.
const held = new WeakMap<
  readonly CosmosWorld[],
  { byId: ReadonlyMap<string, CosmosWorld>; known: WeakMap<LabelSignals, Known> }
>();
function heldOf(list: readonly CosmosWorld[], reading: Reading) {
  const kept = held.get(list) ?? { byId: new Map(list.map((world) => [world.id, world])), known: new WeakMap() };
  const known = kept.known.get(reading.signals) ?? knownIn(list, reading);
  held.set(list, kept);
  kept.known.set(reading.signals, known);
  return { byId: kept.byId, known };
}

// The far worlds data names round each star a look draws, never a body it draws.
function farAsks({ systems, drawn, signals = NOTHING }: Look, known: Known, shown: ReadonlySet<string>) {
  const asks: LabelAsk[] = [];
  const stars = new Map<string, Point>();
  for (let at = 0; at < drawn.starCount; at += 1) {
    const system = systems[drawn.stars[at] ?? -1];
    for (const [{ id }, said] of (system && known.get(system.id)) ?? []) {
      if (system === undefined || shown.has(id) || stars.has(id)) continue;
      asks.push({ id, kind: "far", ...nameOf(signals.names, id), signals: said });
      stars.set(id, system.place);
    }
  }
  return { asks, stars };
}

const nameOf = (names: LabelSignals["names"], id: string) => {
  const name = names.get(id);
  return name === undefined ? {} : { name };
};

/** What a look asks labels for, and the star each far world's label points at. */
export function asksOf(look: Look) {
  const { bodies, list, signals = NOTHING, callersOf } = look;
  const reading = { signals, callersOf };
  const { byId, known } = heldOf(list, reading);
  const asks: LabelAsk[] = [{ id: "earth", kind: "earth", signals: signalsOf(undefined, "earth", reading) }];
  for (const { id } of [...bodies].sort((a, b) => a.away - b.away))
    asks.push({ id, kind: "near", ...nameOf(signals.names, id), signals: signalsOf(byId.get(id), id, reading) });
  const far = farAsks(look, known, new Set(bodies.map(({ id }) => id)));
  return { asks: [...asks, ...far.asks], stars: far.stars };
}
