// What the palette does with a place: go to it (a world flies, through the router), open its chat, copy its link; each closes the palette
// but the copy. A command runs: the Earth, the universe, the map, Go explore.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { fullChatHref } from "../../fullChat.ts";
import { rememberPath } from "../../lib/recents.ts";
import { site, universePath, type UniverseView } from "../../places.ts";
import { useExplore } from "../home/index.ts";
import { showMap } from "../../mapView.ts";
import type { SearchItem } from "./types.ts";

export function useGo(universe: UniverseView, close: () => void) {
  const navigate = useNavigate();
  const explore = useExplore({ earth: universe.earth.path, worlds: universe.worlds, universe: universe.id });
  const [copied, setCopied] = useState(false);
  // "Copied" says so for a moment; the palette's closing ends its timer.
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => {
      setCopied(false);
    }, 1500);
    return () => {
      clearTimeout(timer);
    };
  }, [copied]);
  const pathOf = (item: SearchItem): string => {
    if (item.kind !== "command") return item.path;
    if (item.name === "earth") return universe.earth.path;
    return universePath(universe);
  };
  const go = (item: SearchItem, to = pathOf(item)) => {
    close();
    if (item.kind !== "command") rememberPath(item.path);
    if (item.command === "explore") {
      explore();
      return;
    }
    if (item.command === "plan") showMap(true);
    Promise.resolve(navigate(to)).catch(reportError);
  };
  // A world's chat is docked on its page, the Earth's on its own: any other place says its chat on its universe's Earth.
  // Opened from the full chat, it stays there: the place's own chat page, its room changing, no space (D393).
  const chat = (item: SearchItem, to?: string) => {
    if (document.documentElement.dataset["chat"] === "full") {
      go(item, fullChatHref(item.path));
      return;
    }
    const own = item.kind === "world" || item.kind === "station" || item.kind === "earth";
    const home = site.universes.find(({ id }) => id === item.universe) ?? universe;
    go(item, to ?? (own ? item.path : home.earth.path));
  };
  const copy = (item: SearchItem) => {
    navigator.clipboard
      .writeText(new URL(pathOf(item), location.origin).href)
      .then(() => {
        setCopied(true);
      })
      .catch(reportError);
  };
  return { go, chat, copy, copied };
}
