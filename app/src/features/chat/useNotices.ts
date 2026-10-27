// What the chat's page tells the account of what it has not seen (slice 4's 4f-n): a count on each room's and
// conversation's row, the tab's title, a list of the notices, a status for a screen reader, and the room in view's mode.
// A guest is told nothing: the store holds nothing for one.
import type { Notice, NoticeMode } from "@gnoworld/core";
import type { RoomList } from "@gnoworld/schemas";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { modeOf, placeCounts, totalUnseen, unseenNotices } from "../../store/notices.ts";
import type { AppState } from "../../store/index.ts";
import { useApp, useAppStore } from "../../storeContext.tsx";
import type { Dms } from "./Dms.tsx";
import { roomIds } from "./names.ts";
import { noticeSaid, type RoomsViewProps } from "./RoomsView.tsx";
import type { RoomViewProps } from "./RoomView.tsx";
import { useTabTitle } from "./tabTitle.ts";

/** What the page hands its views: each row's count, the list, and the mode of the room in view; none for a guest. */
export interface Noticing {
  badges?: RoomsViewProps["badges"];
  list?: RoomsViewProps["notices"];
  notify?: RoomViewProps["notify"];
  /** A conversation seen up to a time. */
  seen: (partner: string, time: string) => void;
}

// A guest's list: one array for every render, since a new one each time is a new list to useAnnounced, which sets its state
// on it again and again; the compiler hid that in the build alone.
const NONE: readonly Notice[] = [];

// What a screen reader is told as a notice comes, one for a place outside the one in view: the newest of those that came
// since the list last changed, said until the next, or until nothing is unseen. Its id keys the status, so the same words
// said again are said anew. The first list is the one the page started with, told of nothing.
function useAnnounced(list: readonly Notice[], inView: string | undefined): { said: string; id: string } {
  const [last, setLast] = useState({ list, said: "", id: "" });
  if (last.list === list) return last;
  const known = new Set(last.list.map(({ id }) => id));
  const fresh = list.findLast(({ id, where }) => !known.has(id) && where !== inView);
  const heard = fresh === undefined ? { said: last.said, id: last.id } : { said: noticeSaid(fresh), id: fresh.id };
  setLast({ list, ...(list.length === 0 ? { said: "", id: "" } : heard) });
  return last;
}

// The room in view's mode and how it changes, as the room's view takes them; none for a direct message.
function notifyOf(
  room: string | undefined,
  held: { mode: NoticeMode; notKept: boolean } | undefined,
  actions: AppState["noticeActions"],
): Noticing["notify"] {
  if (room === undefined || held === undefined) return undefined;
  return {
    ...held,
    onMode: (next) => {
      actions.setMode(room, next);
    },
  };
}

/** The notices of the page: its rooms and conversations listed, the one open, and the room in view among them. */
export function useNotices(on: {
  world: string;
  session: AppState["login"]["session"];
  sections: RoomList["sections"] | undefined;
  dms: Dms;
  current: string | undefined;
  /** Tells Ergo a room is read to a time, as Clear sets it. */
  read?: (room: string, time: string) => void;
}): Noticing {
  const { world, session, sections, dms, current, read } = on;
  // The room in view, none while a direct message is; each room and conversation listed counts.
  const room = dms.partner === undefined && dms.problem === undefined ? current : undefined;
  const inView = dms.partner ?? room;
  const places = [...roomIds(sections ?? []), ...(dms.nav?.partners ?? [])];
  const { noticeActions } = useAppStore().getState();
  const account = session.kind === "in";
  // Each a value that stays while no count and no mode moves, so a change of a room that moves none draws nothing again.
  const total = useApp((app) => (account ? totalUnseen(app) : 0));
  const badges = useApp(
    useShallow((app) => {
      const counts = account ? placeCounts(app) : new Map<string, number>();
      return Object.fromEntries(places.map((where) => [where, counts.get(where) ?? 0]));
    }),
  );
  const list = useApp(unseenNotices);
  const held = useApp(
    useShallow((app) => (room === undefined ? undefined : { mode: modeOf(app, room), notKept: app.noticeNotKept })),
  );
  useTabTitle(total);
  const { said, id: saidId } = useAnnounced(account ? list : NONE, inView);
  // Clear sees every place on the page, and its marks go to the link, which tells Ergo those of the rooms, as a read does.
  const onClear = () => {
    for (const [place, time] of noticeActions.clear()) read?.(place, time);
  };
  if (!account) return { seen: noticeActions.seen };
  return {
    badges,
    list: { list, world, said, saidId, onClear },
    notify: notifyOf(room, held, noticeActions),
    seen: noticeActions.seen,
  };
}
