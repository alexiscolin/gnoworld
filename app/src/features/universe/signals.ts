// Who is here, as the cosmos's labels read it (7h): the server's counts keyed by each world as the cosmos holds it (a hub's world is its first
// realm's, gov/dao for the slug govdao; the Earth and a hub with no realm by their slug), the default universe's hubs' names, and this
// reader's visits. A chunk of its own, asked after the first screen. A failed read keeps the names and visits and drops every count.
import hubs from "../../../data/hubs.json" with { type: "json" };
import universes from "../../../data/universes.json" with { type: "json" };
import type { Presence } from "@gnoworld/schemas/indexer";
import { pagePresenceApi } from "../../lib/api/presence.ts";
import { hubWorldOf } from "../../lib/hubWorld.ts";
import type { LabelSignals } from "../../scene/cosmos/cosmosWorld.ts";
import { visitedIn } from "./globe.ts";

/** The labels' signals from the server's answer, read at `now`. */
export function signalsOf({ worlds }: Presence, now: number): LabelSignals {
  const universe = universes.find((each) => each.default === true)?.id ?? "";
  const ours = hubs.filter((hub) => hub.universe === universe);
  const bySlug = new Map(ours.map((hub) => [hub.slug, hubWorldOf(hub)]));
  return {
    present: new Map(
      worlds.map(({ world, here, perHour, rise }) => [bySlug.get(world) ?? world, { here, perHour, rise }]),
    ),
    names: new Map(ours.map((hub) => [hubWorldOf(hub), hub.name])),
    visited: visitedIn(universe),
    now,
  };
}

/** Who is here now, or, when the server does not say, the signals kept with no count; none before any answer. */
export async function readSignals(kept: LabelSignals | undefined): Promise<LabelSignals | undefined> {
  const read = await pagePresenceApi().read();
  if (read.ok) return signalsOf(read.value, Date.now());
  return kept === undefined ? undefined : { ...kept, present: new Map() };
}
