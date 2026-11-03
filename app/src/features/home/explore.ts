// Where "Go explore" goes (ADR-0003 §3): the world with the most people now, by the server's presence read as the click comes, never the
// Earth, which "Join the chat" and "Start here" lead to; the Earth when no world the page lists has anyone, or when the server does not say.
// A chunk of its own, asked at the click: the first screen holds none of it.
import type { Presence } from "@gnoworld/schemas/indexer";
import type { Result } from "../../lib/api/http.ts";
import { pagePresenceApi } from "../../lib/api/presence.ts";

/** The places the page lists: the Earth's page, and each world's by its roles file's slug, the presence's key. */
export interface ExplorePlaces {
  readonly earth: string;
  readonly worlds: readonly { readonly slug: string; readonly path: string }[];
}

const EARTH = "earth";

/** The page of the busiest world of `places` but the Earth, by the presence `read` gives; the Earth's when none has anyone. */
export async function exploreTo(
  places: ExplorePlaces,
  read: () => Promise<Result<Presence>> = pagePresenceApi().read,
): Promise<string> {
  const answer = await read();
  if (!answer.ok) return places.earth;
  const here = new Map(answer.value.worlds.map(({ world, here: people }) => [world, people]));
  let best: { path: string; people: number } = { path: places.earth, people: 0 };
  // The page's own order breaks a tie: the first listed of the busiest.
  for (const { slug, path } of places.worlds) {
    const people = slug === EARTH ? 0 : (here.get(slug) ?? 0);
    if (people > best.people) best = { path, people };
  }
  return best.path;
}
