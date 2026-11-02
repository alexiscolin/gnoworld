// What a look asks labels for (slice 7, 7h): the Earth, the bodies the view draws, nearest first, and the worlds round the stars it draws that
// real data names: people here, a rise, callers the file counts, a new world this reader has not visited. A world nothing names asks for
// none: signs always mean real data (ADR-0002 §10).
import {
  daysSince,
  isFresh,
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
}

function signalsOf(world: CosmosWorld | undefined, id: string, { present, visited, now }: LabelSignals): Signals {
  const here = present.get(id);
  const use = world?.realms.reduce((sum, { callers }) => sum + (callers ?? 0), 0) ?? 0;
  return {
    ...(here === undefined ? {} : { here: here.here, perHour: here.perHour }),
    ...(here?.rise === null || here === undefined ? {} : { rise: here.rise }),
    ...(use > 0 ? { use } : {}),
    ...(isFresh(daysSince(world?.seen, now), visited(id)) ? { uncharted: true } : {}),
  };
}

const named = ({ here = 0, rise, use = 0, uncharted = false }: Signals) =>
  here > 0 || rise !== undefined || use > 0 || uncharted;

// The file's worlds that data names, kept once a file and signals: a look reads only those round the stars it draws. ponytail: a pass over
// the file each time it or the signals change, 20,000 worlds at most.
const known = new WeakMap<readonly CosmosWorld[], WeakMap<LabelSignals, [CosmosWorld, Signals][]>>();
function knownOf(list: readonly CosmosWorld[], signals: LabelSignals): [CosmosWorld, Signals][] {
  const held = known.get(list) ?? new WeakMap<LabelSignals, [CosmosWorld, Signals][]>();
  known.set(list, held);
  const found =
    held.get(signals) ??
    list.flatMap((world): [CosmosWorld, Signals][] => {
      const said = signalsOf(world, world.id, signals);
      return named(said) ? [[world, said]] : [];
    });
  held.set(signals, found);
  return found;
}

/** What a look asks labels for, and the star each far world's label points at. */
export function asksOf({ systems, drawn, bodies, list, signals = NOTHING }: Look) {
  const byId = new Map(list.map((world) => [world.id, world]));
  const withName = (id: string) => {
    const name = signals.names.get(id);
    return name === undefined ? {} : { name };
  };
  const asks: LabelAsk[] = [{ id: "earth", kind: "earth", signals: signalsOf(undefined, "earth", signals) }];
  for (const { id } of [...bodies].sort((a, b) => a.away - b.away))
    asks.push({ id, kind: "near", ...withName(id), signals: signalsOf(byId.get(id), id, signals) });
  const shown = new Set(bodies.map(({ id }) => id));
  const around = new Map<string, Point>();
  for (let at = 0; at < drawn.starCount; at += 1) {
    const system = systems[drawn.stars[at] ?? -1];
    if (system !== undefined) around.set(system.id, system.place);
  }
  const stars = new Map<string, Point>();
  for (const [world, said] of knownOf(list, signals)) {
    const star = around.get(world.namespace);
    if (star === undefined || shown.has(world.id)) continue;
    asks.push({ id: world.id, kind: "far", ...withName(world.id), signals: said });
    stars.set(world.id, star);
  }
  return { asks, stars };
}
