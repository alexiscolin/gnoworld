// What the bell keeps doing once the page has settled (slice 8): its count, and the reminders asked in the calendar, told in the top
// centre's pill while the page is open, or at the next open, never for an event already over (Alexis's answer 3). One timer, the nearest
// reminder within a day: a timer past 2^31 ms would fire at once.
import { events, news } from "../../lateData.ts";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { unseenNotices } from "../../store/notices.ts";
import { useApp, useAppStore } from "../../storeContext.tsx";
import { raisePill } from "../../topPill.tsx";
import { isLive, placeOf, remindersAt, universeAt } from "../events/index.ts";
import { feedOf, isUnread } from "./feed.ts";

const MINUTE_MS = 60_000;
const NOBODY: ReadonlyMap<string, number> = new Map();

function useReminders() {
  const store = useAppStore();
  const navigate = useNavigate();
  const reminders = useApp(({ device }) => device.reminders);
  // A step of the clock, each time the timer for the next reminder rings.
  const [rung, setRung] = useState(0);
  useEffect(() => {
    const now = Date.now();
    const { due, over, next } = remindersAt(events, reminders, now);
    const universe = universeAt(location.pathname);
    // The pill holds one message: the soonest due, and how many more (Alexis, 2026-11-05, "Une pastille pour tous").
    const [event, ...more] = due.toSorted(
      (a, b) => Date.parse(a.start) - Date.parse(b.start) || a.id.localeCompare(b.id),
    );
    if (event !== undefined) {
      const place = event.world === undefined ? undefined : placeOf(universe, event.world);
      const live = Date.parse(event.start) <= now;
      const where = place === undefined ? "" : ` · ${place.name}`;
      raisePill({
        title: event.title,
        line: `${live ? "Live now" : "Starts in a few minutes"}${where}${more.length === 0 ? "" : ` · and ${String(more.length)} more`}`,
        ...(place === undefined
          ? {}
          : {
              action: {
                label: "Go there",
                onAction: () => {
                  Promise.resolve(navigate(place.href)).catch(reportError);
                },
              },
            }),
      });
    }
    const told = new Set([...due, ...over].map(({ id }) => id));
    if (told.size > 0)
      store
        .getState()
        .deviceActions.change("reminders", (held) =>
          Object.fromEntries(Object.entries(held).map(([id, kept]) => [id, told.has(id) ? { fired: true } : kept])),
        );
    if (next === undefined) return undefined;
    const timer = setTimeout(() => {
      setRung((count) => count + 1);
    }, next - now);
    return () => {
      clearTimeout(timer);
    };
  }, [reminders, rung, store, navigate]);
}

export function Watch({ onCount }: { onCount: (count: number) => void }) {
  // The clock read each minute: an event comes into the coming day, a news item ages out.
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
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
  useReminders();
  return null;
}
