// Who is here, as the cosmos's labels read it (7h): the server's counts keyed by each world as the cosmos holds it (a hub's world is its first
// realm's, gov/dao for the slug govdao; the Earth and a hub with no realm by their slug), the default universe's hubs' names, this reader's
// visits, and whether they are new (ADR-0003). A chunk of its own, asked after the first screen. The names, visits and newcomer never wait on
// the server; a failed read drops every count.
import hubs from "../../../data/hubs.json" with { type: "json" };
import universes from "../../../data/universes.json" with { type: "json" };
import { hubWorldOf } from "@gnoworld/core";
import type { Presence } from "@gnoworld/schemas/indexer";
import { pagePresenceApi } from "../../lib/api/presence.ts";
import { isNewcomer } from "../../lib/newcomer.ts";
import type { LabelSignals } from "../../scene/cosmos/cosmosWorld.ts";
import { visitedIn } from "../../lib/visits.ts";

/** The labels' signals from the server's answer, read at `now`. */
export function signalsOf({ worlds }: Presence, now: number): LabelSignals {
  const universe = universes.find((each) => each.default === true)?.id ?? "";
  // A station's world stands round the Earth, never in the cloud (Alexis, 2026-11-05): it names no label, and its people count on none.
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
    newcomer: isNewcomer,
    now,
  };
}

/** What the labels know with no word from the server, read at `now`: the names and this reader's visits, no count. */
export const localSignals = (now: number): LabelSignals => signalsOf({ worlds: [] }, now);

/** Who is here now; when the server does not say, the local signals if `kept` held counts, else nothing new. */
export async function readSignals(kept: LabelSignals): Promise<LabelSignals | undefined> {
  const read = await pagePresenceApi().read();
  if (read.ok) return signalsOf(read.value, Date.now());
  return kept.present.size === 0 ? undefined : localSignals(Date.now());
}
