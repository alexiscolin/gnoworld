// Who is here, as the cosmos's labels read it (7h): the server's counts keyed by each world as the cosmos holds it (a hub's world is its first
// realm's, gov/dao for the slug govdao; the Earth and a hub with no realm by their slug), the default universe's hubs' names, this reader's
// visits, and whether they are new (ADR-0003). A chunk of its own, asked after the first screen. The names, visits and newcomer never wait on
// the server; a failed read drops every count.
import hubs from "../../../data/hubs.json" with { type: "json" };
import universes from "../../../data/universes.json" with { type: "json" };
import { EARTH, hubWorldOf } from "@gnoworld/core";
import type { Presence } from "@gnoworld/schemas/indexer";
import { pagePresenceApi } from "../../lib/api/presence.ts";
import { isNewcomer } from "../../lib/newcomer.ts";
import type { LabelSignals } from "../../scene/cosmos/cosmosWorld.ts";
import { visitedIn } from "../../lib/visits.ts";
import { roomWorld } from "../chat/index.ts";
import { events } from "../../lateData.ts";
import { comingEvents, comingIn } from "../../lib/coming.ts";
import { friendAmong, isHere } from "../follow/index.ts";

/** What the page holds of people: those the reader follows, by account, and the rooms its chat follows, with their members. */
export interface Held {
  readonly people: readonly string[];
  readonly rooms: Readonly<Record<string, { readonly members: readonly string[] }>>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// A world's next event within the day, live or coming, as its label's chip says it: "AMA in 11 h", "Event live now".
function eventsIn(worldOf: (slug: string) => string | undefined, now: number): Map<string, string> {
  const chips = new Map<string, string>();
  for (const event of comingEvents(events, now)) {
    const world = event.world === undefined ? undefined : worldOf(event.world);
    if (world === undefined || chips.has(world) || Date.parse(event.start) - now > DAY_MS) continue;
    chips.set(world, `${event.kind ?? "Event"} ${comingIn(event, now)}`);
  }
  return chips;
}

// A followed person in a room the page's chat holds, on its world's label: nothing is asked of anyone for it (Alexis, 8p, option a).
function peopleIn(worldOf: (slug: string) => string | undefined, held: Held | undefined): Map<string, string> {
  const chips = new Map<string, string>();
  for (const [room, { members }] of Object.entries(held?.rooms ?? {})) {
    const world = worldOf(roomWorld(room));
    const friend = world === undefined || chips.has(world) ? undefined : friendAmong(held?.people ?? [], members);
    if (world !== undefined && friend !== undefined) chips.set(world, isHere(friend));
  }
  return chips;
}

// A world's chips only where some world wears one.
const chipsOf = (key: "events" | "people", chips: ReadonlyMap<string, string>) =>
  chips.size === 0 ? {} : { [key]: chips };

/** The labels' signals from the server's answer and what the page `held`, read at `now`. */
export function signalsOf({ worlds }: Presence, now: number, held?: Held): LabelSignals {
  const universe = universes.find((each) => each.default === true)?.id ?? "";
  // A station's world stands round the Earth, never in the cloud (Alexis, 2026-11-05): it names no label, and its people count on none.
  const stations = new Set(hubs.filter((hub) => hub.kind === "station").map(({ slug }) => slug));
  const ours = hubs.filter((hub) => hub.universe === universe && !stations.has(hub.slug));
  const bySlug = new Map(ours.map((hub) => [hub.slug, hubWorldOf(hub)]));
  // A slug as the cosmos holds its world: the Earth's own, a hub's first realm's; a station or a slug no hub holds, none.
  const worldOf = (slug: string) => (slug === EARTH ? EARTH : bySlug.get(slug));
  return {
    present: new Map(
      worlds.flatMap(({ world, here, perHour, rise }) =>
        stations.has(world) ? [] : [[bySlug.get(world) ?? world, { here, perHour, rise }] as const],
      ),
    ),
    names: new Map(ours.map((hub) => [hubWorldOf(hub), hub.name])),
    ...chipsOf("events", eventsIn(worldOf, now)),
    ...chipsOf("people", peopleIn(worldOf, held)),
    visited: visitedIn(universe),
    newcomer: isNewcomer,
    now,
  };
}

/** What the labels know with no word from the server, read at `now`: the names, this reader's visits and the chips, no count. */
export const localSignals = (now: number, held?: Held): LabelSignals => signalsOf({ worlds: [] }, now, held);

/** Who is here now; when the server does not say, the local signals if `kept` held counts, else nothing new. */
export async function readSignals(kept: LabelSignals, held?: Held): Promise<LabelSignals | undefined> {
  const read = await pagePresenceApi().read();
  if (read.ok) return signalsOf(read.value, Date.now(), held);
  return kept.present.size === 0 ? undefined : localSignals(Date.now(), held);
}
