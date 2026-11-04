// The bell's lines as the page holds their sources: the account's unseen notices, the data's events and news, and the followed worlds with
// who is here in them once the panel asks the server.
import { events, news } from "../../lateData.ts";
import type { Notice } from "@gnoworld/core";
import { useLocation } from "react-router";
import { unseenNotices } from "../../store/notices.ts";
import { useApp } from "../../storeContext.tsx";
import { dmHref, noticeDone, roomHref, roomLabel, roomWorld } from "../chat/index.ts";
import { isLive, placeOf, universeAt } from "../events/index.ts";
import { worldsFollowedIn } from "../follow/index.ts";
import { feedOf, type Item, type Naming, type Sources } from "./feed.ts";

const EARTH = "earth";

/** The bell's lines at `now`, and what the device holds as read; `here`, who is here in each world when asked. */
export function useFeed(now: number, here: Sources["here"]) {
  const universe = universeAt(useLocation().pathname);
  const notices = useApp(unseenNotices);
  const read = useApp(({ device }) => device.notificationsRead);
  const follows = useApp(({ device }) => device.follows);
  const naming: Naming = {
    notice: (notice: Notice) =>
      notice.kind === "dm"
        ? {
            text: noticeDone(notice),
            where: "Direct message",
            world: undefined,
            href: dmHref(EARTH, notice.where, false),
          }
        : {
            text: noticeDone(notice),
            where: roomLabel(notice.where),
            world: roomWorld(notice.where),
            href: roomHref(notice.where),
          },
    place: (world) => placeOf(universe, world),
    live: isLive,
  };
  const sources: Sources = { notices, events, news, here, followed: worldsFollowedIn(follows, universe.id) };
  const items: Item[] = feedOf(sources, naming, now);
  return { items, read };
}
