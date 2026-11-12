// What the bell keeps doing once the page has settled: its count, read again each minute as an event comes into the coming day.
import { events, news } from "../../lateData.ts";
import { useEffect, useState } from "react";
import { unseenNotices } from "../../store/notices.ts";
import { useApp } from "../../storeContext.tsx";
import { isLive, placeOf, universeAt } from "../events/index.ts";
import { feedOf, isUnread } from "./feed.ts";

const MINUTE_MS = 60_000;
const NOBODY: ReadonlyMap<string, number> = new Map();

export function Watch({ onCount }: { onCount: (count: number) => void }) {
  // The clock read each minute: an event comes into the coming day, a news item ages out.
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, MINUTE_MS);
    return () => {
      clearInterval(timer);
    };
  }, []);
  // The count alone: a notice's words are the panel's, which brings the chat's naming with it.
  const notices = useApp(unseenNotices);
  const read = useApp(({ device }) => device.notificationsRead);
  const universe = universeAt(location.pathname);
  const naming = {
    notice: () => ({ text: "", where: "", world: undefined, href: "" }),
    place: (world: string) => placeOf(universe, world),
    live: isLive,
  };
  const items = feedOf({ notices, events, news, here: NOBODY, followed: [] }, naming, now);
  const unread = items.filter((item) => isUnread(item, read)).length;
  useEffect(() => {
    onCount(unread);
  }, [onCount, unread]);
  return null;
}
