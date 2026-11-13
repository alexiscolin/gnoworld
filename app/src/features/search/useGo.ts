// What the palette does with a place: go to it (a world flies, through the router), open its chat, copy its link; each closes the palette
// but the copy. A command runs: the Earth, the universe, the map, Go explore.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { fullChatHref, holdsChat } from "../../fullChat.ts";
import { copyText } from "../../lib/copy.ts";
import { rememberPath } from "../../lib/recents.ts";
import { site, universePath, type UniverseView } from "../../places.ts";
import { useExplore } from "../home/index.ts";
import { showMap } from "../../mapView.ts";
import type { SearchItem } from "./types.ts";
import { realmChat } from "./discover/realms.ts";

export function useGo(universe: UniverseView, close: () => void) {
  const navigate = useNavigate();
  const explore = useExplore({ earth: universe.earth.path, worlds: universe.worlds, universe: universe.id });
  // What the copy came to says so for a moment, "Copied" or not; the palette's closing ends its timer.
  const [copySaid, setCopySaid] = useState<string>();
  useEffect(() => {
    if (copySaid === undefined) return undefined;
    const timer = setTimeout(() => {
      setCopySaid(undefined);
    }, 1500);
    return () => {
      clearTimeout(timer);
    };
  }, [copySaid]);
  const pathOf = (item: SearchItem): string => {
    // The chat of the world in view, else the Earth's, opened on the words (features/chat/Searching.tsx).
    if (item.kind === "messages")
      return fullChatHref(
        `${holdsChat(location.pathname) ? location.pathname : universe.earth.path}?find=${encodeURIComponent(item.find ?? "")}`,
      );
    if (item.kind !== "command") return item.path;
    if (item.name === "earth") return universe.earth.path;
    return universePath(universe);
  };
  // A room or a person has its own address, which the full chat keeps in the full chat.
  const addressOf = (item: SearchItem): string =>
    (item.kind === "room" || item.kind === "person") && document.documentElement.dataset["chat"] === "full"
      ? fullChatHref(item.path)
      : pathOf(item);
  const go = (item: SearchItem, to = addressOf(item)) => {
    close();
    if (!["command", "room", "person", "messages"].includes(item.kind)) rememberPath(item.path);
    if (item.command === "explore") {
      explore();
      return;
    }
    if (item.command === "plan") showMap(true);
    Promise.resolve(navigate(to)).catch(reportError);
  };
  // A world's chat is docked on its page, the Earth's on its own, a realm's in its own room, full; any other place says its chat on its Earth.
  // Opened from the full chat, it stays there: the place's own chat page, its room changing, no space (D393).
  const chat = (item: SearchItem, to?: string) => {
    if (item.kind === "room" || item.kind === "person") {
      go(item);
      return;
    }
    if (document.documentElement.dataset["chat"] === "full") {
      go(item, fullChatHref(item.path));
      return;
    }
    const own = item.kind === "world" || item.kind === "station" || item.kind === "earth";
    const home = site.universes.find(({ id }) => id === item.universe) ?? universe;
    go(item, to ?? (own ? item.path : realmChat(item, home.earth.path)));
  };
  const copy = (item: SearchItem) => {
    copyText(new URL(pathOf(item), location.origin).href)
      .then((copied) => {
        setCopySaid(copied ? "Copied" : "Could not copy");
      })
      .catch(reportError);
  };
  return { go, chat, copy, copySaid };
}
