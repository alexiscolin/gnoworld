// Who is here in each world now, as the rail reads it (7i): the server's counts keyed by each world as space holds it (a hub's world is its
// first realm's, gov/dao for the slug govdao; the Earth and a hub with no realm by their slug), the default universe's hubs' names and
// this reader's visits. A chunk of its own, asked once the rail shows. The names and visits never wait on the server; a failed read drops
// every count.
import hubs from "../../../data/hubs.json" with { type: "json" };
import universes from "../../../data/universes.json" with { type: "json" };
import { callersIn, daysSince, hubWorldOf, isFresh, type Signals } from "@gnoworld/core";
import type { Presence } from "@gnoworld/schemas/indexer";
import type { CosmosWorld } from "../../space/cosmosWorld.ts";
import { resultOf } from "../../lib/query/api.ts";
import { presenceOptions } from "../../lib/query/apiReads.ts";
import { queryClient } from "../../lib/query/client.ts";
import { visitedIn } from "../../lib/visits.ts";

/** Who is here in a world, how many messages an hour, and their rise, as the server says them. */
interface Heard {
  readonly here: number;
  readonly perHour: number;
  readonly rise: number | null;
}

/** What is known of the worlds now: who is here in each, by its id as space holds it, the names the data gives, this reader's visits,
 * and when it was read. */
export interface WorldSignals {
  readonly present: ReadonlyMap<string, Heard>;
  readonly names: ReadonlyMap<string, string>;
  readonly visited: (id: string) => boolean;
  readonly now: number;
}

/** The signals from the server's answer, read at `now`. */
function fromPresence({ worlds }: Presence, now: number): WorldSignals {
  const universe = universes.find((each) => each.default === true)?.id ?? "";
  // A station's world stands round the Earth, never in the cloud (Alexis, 2026-11-05): its people count on no world of the rail.
  const stations = new Set(hubs.filter((hub) => hub.kind === "station").map(({ slug }) => slug));
  const ours = hubs.filter((hub) => hub.universe === universe && !stations.has(hub.slug));
  const bySlug = new Map(ours.map((hub) => [hub.slug, hubWorldOf(hub)]));
  return {
    present: new Map(
      worlds.flatMap(({ world, here, perHour, rise }) =>
        stations.has(world) ? [] : [[bySlug.get(world) ?? world, { here, perHour, rise }] as const],
      ),
    ),
    names: new Map(ours.map((hub) => [hubWorldOf(hub), hub.name])),
    visited: visitedIn(universe),
    now,
  };
}

/** What is known with no word from the server, read at `now`: the names and this reader's visits, no count. */
export const localSignals = (now: number): WorldSignals => fromPresence({ worlds: [] }, now);

/** Who is here now; none where the server does not say. */
export async function readSignals(): Promise<WorldSignals | undefined> {
  const read = await resultOf(queryClient.query(presenceOptions));
  return read.ok ? fromPresence(read.value, Date.now()) : undefined;
}

/** What the data says of world `id` now: who is here, its rise, its callers, whether it is new to this reader (7h, 7i). A world under seven
 * days old this reader never entered is uncharted. */
export function signalsOf(
  world: CosmosWorld | undefined,
  id: string,
  { present, visited, now }: WorldSignals,
): Signals {
  const use = world === undefined ? 0 : callersIn(world.realms);
  const uncharted = isFresh(daysSince(world?.seen, now), false) && !visited(id);
  return { ...heardOf(present.get(id)), ...(uncharted ? { uncharted: true } : {}), ...(use > 0 ? { use } : {}) };
}

function heardOf(here: Heard | undefined): Signals {
  if (here === undefined) return {};
  return { here: here.here, perHour: here.perHour, ...(here.rise === null ? {} : { rise: here.rise }) };
}
