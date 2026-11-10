// Where "Go explore" goes (ADR-0002 §1, "the live moment if one is near, otherwise the expedition"; ADR-0003 §3): the world with the most
// people now when it holds a crowd, by the server's presence read as the click comes, never the Earth; else today's next stop, with its pill
// (frame 18); else, the day's stops all reached, the busiest world, or the Earth when nobody is anywhere or the server does not say.
// A chunk of its own, asked at the click: the first screen holds none of it.
import type { Presence } from "@gnoworld/schemas/indexer";
import type { FlashMessage } from "@gnoworld/ui";
import type { Result } from "../../lib/api/http.ts";
import { resultOf } from "../../lib/query/api.ts";
import { presenceOptions } from "../../lib/query/apiReads.ts";
import { queryClient } from "../../lib/query/client.ts";

/** The places the page lists: the Earth's page, and each world's by its roles file's slug, the presence's key; the universe whose expedition
 * it follows, if any, and how its pill opens the passport over a page (the hero that raised it is gone once the flight leaves). */
export interface ExplorePlaces {
  readonly earth: string;
  readonly worlds: readonly { readonly slug: string; readonly path: string }[];
  readonly universe?: string | undefined;
  readonly passportAt?: ((path: string) => void) | undefined;
  /** The shell's top pill, which the expedition's raises (frame 18); handed by the hero, whose chunk holds it already. */
  readonly raise?: ((message: FlashMessage) => void) | undefined;
}

const EARTH = "earth";

/** The fewest people in one world that make a live moment, which goes before the expedition: a room where people are talking now. */
const LIVE_HERE = 5;

/** The page "Go explore" opens from `places`, by the presence `read` gives. */
export async function exploreTo(
  places: ExplorePlaces,
  read: () => Promise<Result<Presence>> = () => resultOf(queryClient.query(presenceOptions)),
): Promise<string> {
  const answer = await read();
  let best: { path: string; people: number } = { path: places.earth, people: 0 };
  if (answer.ok) {
    const here = new Map(answer.value.worlds.map(({ world, here: people }) => [world, people]));
    // The page's own order breaks a tie: the first listed of the busiest.
    for (const { slug, path } of places.worlds) {
      const people = slug === EARTH ? 0 : (here.get(slug) ?? 0);
      if (people > best.people) best = { path, people };
    }
  }
  if (best.people >= LIVE_HERE || places.universe === undefined) return best.path;
  return (await toNextStop(places.universe, places)) ?? best.path;
}

// Today's next stop in `universe`, with its pill raised and its Passport opened by the page's; none once every stop is reached.
async function toNextStop(
  universe: string,
  { raise, passportAt }: Pick<ExplorePlaces, "raise" | "passportAt">,
): Promise<string | undefined> {
  const { nextStop } = await import("../expedition/index.ts");
  const next = nextStop(universe);
  if (next === undefined) return undefined;
  const { path } = next.stop;
  raise?.({
    title: "Today's expedition",
    line: `${String(next.reached)} of ${String(next.of)} · next stop: ${next.stop.name}`,
    ...(passportAt === undefined
      ? {}
      : {
          action: {
            label: "Passport",
            onAction: () => {
              passportAt(path);
            },
          },
        }),
  });
  return path;
}
