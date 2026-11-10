// The rooms that orbit a page's world as moons (D490, ADR-0002 §3): the room the reader is in, then the busiest others, four at most, from
// the activity API (messages a minute, read each 20 s while the page shows); the set holds a minute before it changes, so no moon flickers.
// A world the server lists no room of has none.
import { EARTH, hubWorldOf } from "@gnoworld/core";
import hubs from "../../../data/hubs.json" with { type: "json" };
import { resultOf } from "../../lib/query/api.ts";
import { activityOptions } from "../../lib/query/apiReads.ts";
import { queryClient } from "../../lib/query/client.ts";
import type { Place } from "../../space/place.ts";
import type { Space } from "../../space/scene.ts";
import type { MoonRoom } from "../../space/parts/moons.ts";

const ASK_MS = 20_000;
const LOOK_MS = 2000;
const SET_MS = 60_000;
const MOST = 4;

interface Heard {
  readonly slug: string;
  readonly rates: ReadonlyMap<string, number>;
}
let timers: ReturnType<typeof setInterval>[] = [];
let [heard, kept, keptAt]: [Heard | undefined, readonly string[], number] = [undefined, [], 0];

// A world's rooms are named after its slug: #<slug> its main room, #<slug>/<name> the others.
const slugOf = (id: string): string | undefined =>
  id === EARTH ? "earth" : hubs.find((hub) => hubWorldOf(hub) === id)?.slug;
const openRoom = (slug: string): string => {
  const name = new URLSearchParams(location.search).get("room");
  return name === null ? `#${slug}` : `#${slug}/${name}`;
};

// The rooms to show now: the open one first (if the server lists it), then the set kept for a minute, else the busiest.
function listOf({ slug, rates }: Heard, now: number): MoonRoom[] {
  const open = openRoom(slug);
  if (now - keptAt >= SET_MS || kept.length === 0) {
    kept = [...rates]
      .filter(([, rate]) => rate > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MOST)
      .map(([room]) => room);
    keptAt = now;
  }
  const rooms = [open, ...kept.filter((room) => room !== open)].slice(0, MOST);
  return rooms.filter((room) => rates.has(room)).map((room) => ({ room, rate: rates.get(room) ?? 0 }));
}

/** Moons for the world `id` space shows, none for no world: asked at once, then each 20 s while the tab is seen. */
export function feedMoons(space: Space | undefined, place: Place): void {
  if (space === undefined) return;
  const slug = place.kind === "world" ? slugOf(place.id) : undefined;
  if (slug === heard?.slug && slug !== undefined) return;
  timers.forEach(clearInterval);
  [timers, heard, kept] = [[], undefined, []];
  space.stage.moons.rooms([]);
  if (slug === undefined) return;
  const ask = () => {
    if (document.hidden) return;
    resultOf(queryClient.query(activityOptions(slug)))
      .then((read) => {
        if (!read.ok) return;
        const rates = new Map(
          read.value.rooms.filter((row) => row.world === slug).map(({ room, perMinute }) => [room, perMinute]),
        );
        heard = { slug, rates };
        space.stage.moons.rooms(listOf(heard, Date.now()));
      })
      .catch(reportError);
  };
  // The room the reader is in follows the address as it changes, without asking again.
  const look = () => {
    if (heard?.slug === slug) space.stage.moons.rooms(listOf(heard, Date.now()));
  };
  heard = { slug, rates: new Map() };
  timers = [setInterval(ask, ASK_MS), setInterval(look, LOOK_MS)];
  ask();
}
