// The bell's panel (frames 86, 87): over the dock's column, from under the header to the page's foot. Its title and "Mark all read", the
// kinds with what is unread in each (All, Messages, Worlds, News), the worlds to filter by, then the lines, the newest first, each going
// to its place: a page of the site, or off it through the warning. Esc, a click outside or the bell closes it.
import { ComingSoon, EmptyState, Panel as Surface, Tabs } from "@gnoworld/ui";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useLocation } from "react-router";
import { createPortal } from "react-dom";
import { FOLLOWS_KEPT } from "../../lib/keep/fields.ts";
import { useHere } from "../../useHere.ts";
import { useLeaving } from "../../leaving.tsx";
import { useAppStore } from "../../storeContext.tsx";
import { placeOf, universeAt } from "../events/index.ts";
import { isUnread, type Item, type NoticeKind } from "./feed.ts";
import { Head, Line, WorldChips } from "./PanelParts.tsx";
import { useFeed } from "./useFeed.ts";
import appear from "../../enter.module.css";
import styles from "./Panel.module.css";

const KINDS: { id: "all" | NoticeKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "messages", label: "Messages" },
  { id: "worlds", label: "Worlds" },
  { id: "news", label: "News" },
];

// Closes on Esc, and on a press outside the panel and the bell (the bell toggles it itself), until the panel goes.
function useDismiss(panel: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const leaving = new AbortController();
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") onClose();
      },
      { signal: leaving.signal },
    );
    document.addEventListener(
      "pointerdown",
      ({ target }) => {
        if (!(target instanceof Element) || target.closest("[data-bell]") !== null) return;
        if (panel.current?.contains(target) !== true) onClose();
      },
      { signal: leaving.signal },
    );
    return () => {
      leaving.abort();
    };
  }, [panel, onClose]);
}

// What marks lines read on this device: some by their ids, or all of them, every line up to now and by their ids the lines shown that
// `through` misses (an event to come is later than now, a followed world's row has no time), the rooms' notices seen with them.
function useMarkRead(now: number, shown: readonly Item[]) {
  const store = useAppStore();
  return (ids: readonly string[] | "all") => {
    const marked = ids === "all" ? shown.filter(({ at }) => !(at <= now)).map(({ id }) => id) : ids;
    store.getState().deviceActions.change("notificationsRead", (held) => ({
      through: ids === "all" ? new Date(now).toISOString() : held.through,
      ids: [...new Set([...marked, ...held.ids])].slice(0, FOLLOWS_KEPT),
    }));
    if (ids === "all") store.getState().noticeActions.clear();
  };
}

// The panel shut, once it has left: hidePopover starts the exit (surface.module.css), and the animations it made are done when `onGone` is told.
// A panel shown again while it leaves is not told.
function useShown(panel: RefObject<HTMLElement | null>, open: boolean, onGone: (() => void) | undefined) {
  const openRef = useRef(open);
  const goneRef = useRef(onGone);
  useEffect(() => {
    goneRef.current = onGone;
  });
  useLayoutEffect(() => {
    openRef.current = open;
    const box = panel.current;
    if (box === null) return;
    box.togglePopover(open);
    if (open) return;
    const left = "getAnimations" in box ? box.getAnimations().map((animation) => animation.finished) : [];
    Promise.allSettled(left)
      .then(() => {
        if (!openRef.current) goneRef.current?.();
      })
      .catch(reportError);
  }, [panel, open]);
}

export function Panel({
  onClose,
  open: showing = true,
  onGone,
}: {
  onClose: () => void;
  /** False while it leaves: the bell keeps it mounted until `onGone`. */
  open?: boolean;
  onGone?: () => void;
}) {
  const [now] = useState(Date.now);
  const panelRef = useRef<HTMLDivElement>(null);
  useDismiss(panelRef, onClose);
  const universe = universeAt(useLocation().pathname);
  const { items, read } = useFeed(now, useHere(true));
  const [kind, setKind] = useState<"all" | NoticeKind>("all");
  const [world, setWorld] = useState<string>();
  const leaving = useLeaving();
  const markRead = useMarkRead(now, items);
  const unread = (of: "all" | NoticeKind) =>
    items.filter((item) => (of === "all" || item.kind === of) && isUnread(item, read)).length;
  const shown = items.filter(
    (item) => (kind === "all" || item.kind === kind) && (world === undefined || item.world === world),
  );
  const open = (item: Item) => {
    markRead([item.id]);
    if (item.external === true && item.href !== undefined) leaving.ask(item.href);
    else onClose();
  };
  // In the top layer, over the dock and its full chat alike; it closes itself (useDismiss), so the browser's light dismiss is not asked.
  useShown(panelRef, showing, onGone);
  return createPortal(
    <div ref={panelRef} className={styles["place"]} popover="manual" data-takes-escape="" inert={!showing}>
      <Surface label="Notifications" look="floating">
        <Head
          onMarkAll={() => {
            markRead("all");
          }}
        />
        <Tabs
          label="Kinds"
          size="s"
          tabs={KINDS.map(({ id, label }) => ({ id, label, count: unread(id) }))}
          selected={kind}
          onSelect={(id) => {
            setKind(id === "messages" || id === "worlds" || id === "news" ? id : "all");
          }}
        />
        <WorldChips
          worlds={[...new Set(items.flatMap((item) => (item.world === undefined ? [] : [item.world])))]}
          shown={world}
          name={(slug) => placeOf(universe, slug)?.name ?? slug}
          onShow={setWorld}
        />
        {shown.length === 0 ? (
          <EmptyState title="Nothing here" line="What you are told of comes here." level={3} />
        ) : (
          <ol key={`${kind}:${world ?? ""}`} className={[styles["list"], appear["enter"]].join(" ")}>
            {shown.map((item) => (
              <Line key={item.id} item={item} now={now} unread={isUnread(item, read)} onOpen={open} />
            ))}
          </ol>
        )}
        {/* The chain's own lines (a new realm's signal, a proposal opened or closing) come with the indexer's events, slice 9. */}
        <ComingSoon name="New realms and proposals, from the chain">
          New realms and proposals, from the chain
        </ComingSoon>
        <p className={styles["note"]}>What you have read is kept on this device alone.</p>
      </Surface>
      {leaving.dialog}
    </div>,
    document.body,
  );
}
