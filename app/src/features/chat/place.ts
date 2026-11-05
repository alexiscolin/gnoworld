// What the chat says of a place (moved out of places.ts, then into the chat's own chunk, which every page with a chat loads): its header's kicker, its column of worlds, its info panel's links out and
// its quick actions' row (8d), from the data files.
import type { UniverseView } from "../../places.ts";
import type { ChatPlace } from "./ChatScreen.tsx";

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
  worlds: universe.worlds.map(({ path: href, ...world }) => ({ ...world, href })),
  universe,
});

/** The general chat, one for every universe: the Earth stays one place (ADR-0002 §10). Its pills are the Earth's (frame 56). */
export const EARTH_CHAT = {
  slug: "earth",
  name: "Earth",
  description: "Where people speak from. Countries are opt-in.",
  inPage: true,
  earth: true,
};

/** The Earth's chat's kicker, on its page and docked over the cosmos. */
export const EARTH_KICKER = "Earth · General chat";
