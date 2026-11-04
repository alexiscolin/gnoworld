// What the chat says of a place (moved out of places.ts): its header's kicker, its column of worlds, its info panel's links out and
// its quick actions' row (8d), from the data files.
import type { ChatPlace } from "./features/chat/index.ts";
import type { UniverseView } from "./places.ts";

/** What the chat's header, its column of worlds, its info panel and its pills say of a place in `universe`: `kicker` says
 * where it is; the place's own `earth` and `realms` choose its pills (Dock.tsx). */
export const chatPlace = (
  place: Pick<ChatPlace, "slug" | "name" | "description" | "inPage" | "earth" | "realms">,
  universe: UniverseView,
  kicker = `${universe.name} · ${place.name}`,
): ChatPlace => ({
  ...place,
  kicker,
  home: universe.home.path,
  worlds: universe.worlds.map(({ slug, name, path }) => ({ slug, name, href: path })),
  universe,
});
